import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { WAVEFORM_BARS } from '@/features/chat/useVoiceRecorder';

type Props = {
  uri: string;
  durationMs: number | null;
  /** Recorded amplitude samples (0-100). Null = pre-waveform message →
   *  a deterministic placeholder wave is drawn from the uri instead. */
  waveform?: number[] | null;
  /** Own bubbles sit on the ink background → light foreground. */
  isOwn: boolean;
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MIN_BAR = 4;
const MAX_BAR = 26;

/** Deterministic speech-looking placeholder for messages recorded
 *  before waveforms were stored — seeded from the uri so the same
 *  message always renders the same wave. */
function placeholderWave(seedStr: string): number[] {
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed = Math.imul(seed ^ seedStr.charCodeAt(i), 16777619);
  }
  const out: number[] = [];
  let prev = 50;
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    seed = Math.imul(seed, 1597334677) + 12345;
    const rnd = ((seed >>> 8) % 1000) / 1000;
    // Random walk keeps neighbours related — reads as speech, not noise.
    prev = Math.max(10, Math.min(95, prev + (rnd - 0.5) * 55));
    out.push(Math.round(prev));
  }
  return out;
}

/** Resample a stored waveform to the render bar count (older/newer
 *  messages may have been stored at a different resolution). */
function fitBars(wave: number[]): number[] {
  if (wave.length === WAVEFORM_BARS) return wave;
  const out: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    out.push(wave[Math.floor((i * wave.length) / WAVEFORM_BARS)] ?? 0);
  }
  return out;
}

/** Voice-note player: play/pause + amplitude waveform (Telegram/
 *  WhatsApp-style bars that fill left-to-right with playback) + time.
 *  Loads the sound lazily on first play (expo-av via require — see
 *  useVoiceRecorder for why it can't be a static import yet). */
export function AudioBubble({ uri, durationMs, waveform, isOwn }: Props) {
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs ?? 0);
  const [error, setError] = useState(false);
  const soundRef = useRef<{
    playAsync: () => Promise<unknown>;
    pauseAsync: () => Promise<unknown>;
    setPositionAsync: (ms: number) => Promise<unknown>;
    unloadAsync: () => Promise<unknown>;
  } | null>(null);

  const bars = useMemo(
    () =>
      waveform && waveform.length >= 3 ? fitBars(waveform) : placeholderWave(uri),
    [waveform, uri],
  );

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const toggle = async () => {
    try {
      if (!soundRef.current) {
        const { Audio } = require('expo-av') as typeof import('expo-av');
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPositionMs(status.positionMillis ?? 0);
            if (status.durationMillis) setTotalMs(status.durationMillis);
            if (status.didJustFinish) {
              setPlaying(false);
              setPositionMs(0);
              void sound.setPositionAsync(0);
            }
          },
        );
        soundRef.current = sound;
        setPlaying(true);
        return;
      }
      if (playing) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch {
      setError(true);
    }
  };

  const fg = isOwn
    ? 'text-surface-light dark:text-surface-dark'
    : 'text-text-light dark:text-text-dark';
  const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const playedBars = Math.round(progress * bars.length);

  if (error) {
    return (
      <Text className={`text-[13px] italic ${fg}`}>
        Voice message — playback needs the updated app build
      </Text>
    );
  }

  return (
    <View className="w-56 flex-row items-center gap-2.5">
      <Pressable
        onPress={toggle}
        accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
        className={[
          'h-9 w-9 items-center justify-center rounded-full',
          isOwn ? 'bg-surface-light/20 dark:bg-surface-dark/20' : 'bg-brand-500/15',
        ].join(' ')}
      >
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={16}
          color={isOwn ? '#F6F4EE' : '#4B5FE0'}
        />
      </Pressable>
      <View className="flex-1 gap-1">
        <View
          className="flex-row items-center"
          style={{ height: MAX_BAR, gap: 2 }}
          accessibilityLabel="Voice message waveform"
        >
          {bars.map((v, i) => (
            <View
              key={i}
              className={
                i < playedBars
                  ? isOwn
                    ? 'bg-surface-light dark:bg-surface-dark'
                    : 'bg-brand-500'
                  : isOwn
                    ? 'bg-surface-light/30 dark:bg-surface-dark/30'
                    : 'bg-border-light dark:bg-border-dark'
              }
              style={{
                flex: 1,
                borderRadius: 2,
                height: MIN_BAR + (Math.min(100, Math.max(0, v)) / 100) * (MAX_BAR - MIN_BAR),
              }}
            />
          ))}
        </View>
        <Text className={`font-mono text-[9px] uppercase ${fg} opacity-70`}>
          {playing || positionMs > 0 ? fmt(positionMs) : fmt(totalMs)}
        </Text>
      </View>
    </View>
  );
}
