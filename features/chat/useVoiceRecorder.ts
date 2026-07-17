import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type RecorderState = 'idle' | 'recording';

export type VoiceRecording = {
  uri: string;
  durationMs: number;
  /** ~36 amplitude samples, ints 0-100 — the message's waveform.
   *  Null when metering wasn't available (very short take, old build). */
  waveform: number[] | null;
};

/** How many bars a stored waveform has. Also the render count in
 *  AudioBubble — keep the two in sync. */
export const WAVEFORM_BARS = 36;

/** Map expo-av's dBFS metering (-160..0) to 0..1. Speech mostly lives
 *  in -45..-10 dB, so full scale spans -50..0. */
function normalizeDb(db: number): number {
  return Math.min(1, Math.max(0, (db + 50) / 50));
}

/** Reduce raw samples to `bars` peaks, normalized so the loudest moment
 *  fills the bubble even for quiet talkers (boost capped at 2.5x so a
 *  silent room doesn't render as shouting). */
function toWaveform(samples: number[], bars = WAVEFORM_BARS): number[] | null {
  if (samples.length < 3) return null;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, samples[j] ?? 0);
    out.push(peak);
  }
  const max = Math.max(...out);
  const scale = max > 0 ? Math.min(2.5, 1 / max) : 1;
  return out.map((v) => Math.round(Math.min(1, v * scale) * 100));
}

/** Wraps expo-av's Audio.Recording.
 *
 *  expo-av is loaded lazily (require at call time, not import time):
 *  the currently-shipped iOS dev client was built before expo-av was
 *  added, so a static import would crash the whole app at bundle eval.
 *  With the lazy require, everything else works on the old build and
 *  the mic button surfaces a "needs the updated app build" error until
 *  the next EAS build. Web works immediately (MediaRecorder → webm).
 *
 *  Amplitude capture for the waveform:
 *   - native: expo-av metering (isMeteringEnabled + status updates)
 *   - web: expo-av doesn't meter, so a parallel AnalyserNode samples
 *     mic RMS ~10x/sec while the MediaRecorder runs
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const recordingRef = useRef<{ stopAndUnloadAsync: () => Promise<unknown>; getURI: () => string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const webMeterRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    timer: ReturnType<typeof setInterval>;
  } | null>(null);

  const stopWebMeter = useCallback(() => {
    const meter = webMeterRef.current;
    webMeterRef.current = null;
    if (!meter) return;
    clearInterval(meter.timer);
    meter.stream.getTracks().forEach((t) => t.stop());
    void meter.ctx.close().catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopWebMeter();
      // Best-effort cleanup if unmounted mid-recording.
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, [stopWebMeter]);

  /** Web-only: second mic tap purely for amplitude (the recording
   *  itself stays with expo-av). Failure is silent — the message just
   *  ships without a waveform. */
  const startWebMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = ((buf[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        // RMS of speech peaks around ~0.25 — 4x gain lands it near 1.
        samplesRef.current.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      }, 100);
      webMeterRef.current = { ctx, stream, timer };
    } catch {
      /* no waveform, recording still works */
    }
  }, []);

  const start = useCallback(async () => {
    let AudioModule: typeof import('expo-av');
    try {
      AudioModule = require('expo-av') as typeof import('expo-av');
    } catch {
      throw new Error(
        'Voice messages need the updated app build — coming in the next release.',
      );
    }
    const { Audio } = AudioModule;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Microphone access is off. Enable it in Settings to record.');
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    samplesRef.current = [];
    // Non-null: the preset table is indexed, and noUncheckedIndexedAccess
    // widens HIGH_QUALITY to `| undefined` even though it always exists.
    const preset = Audio.RecordingOptionsPresets.HIGH_QUALITY!;
    const { recording } = await Audio.Recording.createAsync(
      { ...preset, isMeteringEnabled: true },
      (status) => {
        if (status.isRecording && typeof status.metering === 'number') {
          samplesRef.current.push(normalizeDb(status.metering));
        }
      },
      100,
    );
    recordingRef.current = recording;
    if (Platform.OS === 'web') void startWebMeter();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState('recording');
    timerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startedAtRef.current),
      250,
    );
  }, [startWebMeter]);

  const finish = useCallback(async (): Promise<VoiceRecording | null> => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    stopWebMeter();
    setState('idle');
    if (!rec) return null;
    const durationMs = Date.now() - startedAtRef.current;
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (!uri || durationMs < 500) return null; // accidental tap — drop it
    return { uri, durationMs, waveform: toWaveform(samplesRef.current) };
  }, [stopWebMeter]);

  const cancel = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    stopWebMeter();
    setState('idle');
    await rec?.stopAndUnloadAsync().catch(() => {});
  }, [stopWebMeter]);

  return { state, elapsedMs, start, finish, cancel };
}
