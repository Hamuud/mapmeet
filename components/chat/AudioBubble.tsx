import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = {
  uri: string;
  durationMs: number | null;
  /** Own bubbles sit on the ink background → light foreground. */
  isOwn: boolean;
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Minimal voice-note player: play/pause + progress bar + time. Loads
 *  the sound lazily on first play (expo-av via require — see
 *  useVoiceRecorder for why it can't be a static import yet). */
export function AudioBubble({ uri, durationMs, isOwn }: Props) {
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

  if (error) {
    return (
      <Text className={`text-[13px] italic ${fg}`}>
        Voice message — playback needs the updated app build
      </Text>
    );
  }

  return (
    <View className="w-48 flex-row items-center gap-2.5">
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
          className={
            isOwn
              ? 'h-1 overflow-hidden rounded-full bg-surface-light/25 dark:bg-surface-dark/25'
              : 'h-1 overflow-hidden rounded-full bg-border-light dark:bg-border-dark'
          }
        >
          <View
            className={isOwn ? 'h-1 bg-surface-light dark:bg-surface-dark' : 'h-1 bg-brand-500'}
            style={{ width: `${progress * 100}%` }}
          />
        </View>
        <Text className={`font-mono text-[9px] uppercase ${fg} opacity-70`}>
          {playing || positionMs > 0 ? fmt(positionMs) : fmt(totalMs)}
        </Text>
      </View>
    </View>
  );
}
