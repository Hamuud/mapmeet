import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording';

export type VoiceRecording = {
  uri: string;
  durationMs: number;
};

/** Wraps expo-av's Audio.Recording.
 *
 *  expo-av is loaded lazily (require at call time, not import time):
 *  the currently-shipped iOS dev client was built before expo-av was
 *  added, so a static import would crash the whole app at bundle eval.
 *  With the lazy require, everything else works on the old build and
 *  the mic button surfaces a "needs the updated app build" error until
 *  the next EAS build. Web works immediately (MediaRecorder → webm). */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const recordingRef = useRef<{ stopAndUnloadAsync: () => Promise<unknown>; getURI: () => string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Best-effort cleanup if unmounted mid-recording.
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
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
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    recordingRef.current = recording;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState('recording');
    timerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startedAtRef.current),
      250,
    );
  }, []);

  const finish = useCallback(async (): Promise<VoiceRecording | null> => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setState('idle');
    if (!rec) return null;
    const durationMs = Date.now() - startedAtRef.current;
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (!uri || durationMs < 500) return null; // accidental tap — drop it
    return { uri, durationMs };
  }, []);

  const cancel = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setState('idle');
    await rec?.stopAndUnloadAsync().catch(() => {});
  }, []);

  return { state, elapsedMs, start, finish, cancel };
}
