import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import {
  particleLayout,
  PARTICLE_COUNT,
} from '@/features/events/pinParticles';
import { DEFAULT_STAR_GLYPH } from '@/features/events/pinStyle';
import type { PinEffect } from '@/types/database';

type Props = {
  emoji: string;
  title?: string;
  selected?: boolean;
  compact?: boolean;
  isPrivate?: boolean;
  /** Rendered in the coral accent — use for "you're hosting this". */
  hosted?: boolean;
  /** Premium pin fill (hex), or null/undefined for the standard paper
   *  pin. Resolve it with `resolvePinStyle` — never read pin_color off
   *  the event directly, or a lapsed subscriber keeps their colour. */
  pinColor?: string | null;
  pinEffect?: PinEffect | null;
  /** Falling particles for the 'stars' effect. A designer's own emoji;
   *  defaults to the ✦ sparkle. Fewer than three cycles. */
  pinGlyphs?: string[] | null;
  /** Scatters the falling particles deterministically — pass the event
   *  id so a pin keeps its pattern across reloads. Previews can leave it
   *  out and share the default. */
  pinSeed?: string;
};

const TAG_SIZE = 44;
const TAG_SIZE_SELECTED = 48;

/** Pulsing halo behind the tag. */
function GlowRing({ color, size }: { color: string; size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: 20,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
        ],
      }}
    />
  );
}

/** Particles drifting down past the tag. The literal "falling stars" of
 *  the brief — except a designer can swap the ✦ for their own emoji,
 *  which is why the glyphs are a parameter. They render at the same 10px
 *  either way: the point is confetti, not a second emoji competing with
 *  the one in the pin.
 *
 *  Column, phase, speed and sideways drift all come from the event id
 *  (see pinParticles.ts), so the three particles look scattered rather
 *  than marching left to right — and look the *same* scatter on every
 *  reload, because "random" here must not mean "different every render". */
function FallingStars({
  size,
  glyphs,
  seed,
}: {
  size: number;
  glyphs: string[];
  seed: string;
}) {
  // One ref holding the values, not a useRef call per particle — hooks
  // can't run inside `.map`.
  const drops = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0)),
  ).current;
  const layout = useMemo(() => particleLayout(seed), [seed]);

  useEffect(() => {
    const loops = drops.map((v, i) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: (layout[i]?.duration ?? 1.5) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    // The stagger is a one-shot timer, not a `delay` inside the loop:
    // inside, it would replay every lap and the stream would stutter
    // instead of falling continuously.
    const timers = loops.map((loop, i) =>
      setTimeout(() => loop.start(), (layout[i]?.delay ?? 0) * 1000),
    );
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [drops, layout]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        overflow: 'visible',
      }}
    >
      {drops.map((v, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: layout[i]?.left ?? 4,
            fontSize: 10,
            opacity: v.interpolate({
              inputRange: [0, 0.15, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, size + 4],
                }),
              },
              {
                translateX: v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, layout[i]?.drift ?? 0],
                }),
              },
            ],
          }}
        >
          {glyphs[i % glyphs.length] ?? DEFAULT_STAR_GLYPH}
        </Animated.Text>
      ))}
    </View>
  );
}

/** A translucent bar sweeping diagonally across the tag. Clipped by the
 *  tag's own overflow, so it reads as a highlight rather than a stripe. */
function ShineSweep({ size }: { size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(1400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -size,
        width: size * 0.42,
        height: size * 3,
        backgroundColor: 'rgba(255,255,255,0.55)',
        transform: [
          { rotate: '22deg' },
          {
            translateX: t.interpolate({
              inputRange: [0, 1],
              outputRange: [-size, size],
            }),
          },
        ],
      }}
    />
  );
}

// New pin shape: rounded-rect tag with a slight bottom-left corner clip
// evoking a pin, plus a small dot underneath aligned to the map point.
export function MapMarker({
  emoji,
  title,
  selected,
  compact,
  isPrivate,
  hosted,
  pinColor,
  pinEffect,
  pinGlyphs,
  pinSeed = 'preview',
}: Props) {
  const size = selected ? TAG_SIZE_SELECTED : TAG_SIZE;
  // Selection outranks the premium colour: a user has to be able to tell
  // which pin they just tapped, whoever owns it.
  const styled = !!pinColor && !selected;
  const effect = styled || pinColor ? (pinEffect ?? 'none') : 'none';
  const glyphs = pinGlyphs?.length ? pinGlyphs : [DEFAULT_STAR_GLYPH];

  return (
    <View className="items-center">
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {effect === 'glow' && pinColor ? (
          <GlowRing color={pinColor} size={size} />
        ) : null}

        <View
          style={{
            borderBottomLeftRadius: 4,
            transform: [{ rotate: selected ? '0deg' : '-4deg' }],
            ...(styled
              ? { backgroundColor: pinColor, borderColor: pinColor }
              : null),
            // Only clip when something is sweeping inside — clipping
            // unconditionally would cut off the private-event lock badge,
            // which deliberately overhangs the corner.
            ...(effect === 'shine' ? { overflow: 'hidden' as const } : null),
          }}
          className={[
            'items-center justify-center rounded-2xl border',
            selected
              ? 'bg-text-light dark:bg-text-dark border-text-light dark:border-text-dark'
              : styled
                ? ''
                : hosted
                  ? 'bg-accent-400 border-accent-400'
                  : 'bg-panel-light dark:bg-panel-dark border-border-light dark:border-border-dark',
            selected ? 'h-12 w-12' : 'h-11 w-11',
            selected ? 'shadow-lg shadow-black/40' : 'shadow-md shadow-black/20',
          ].join(' ')}
        >
          {effect === 'shine' ? <ShineSweep size={size} /> : null}
          <Text style={{ fontSize: selected ? 24 : 22 }}>{emoji}</Text>
          {isPrivate ? (
            <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full border border-panel-light bg-text-light dark:border-panel-dark dark:bg-text-dark">
              <Ionicons name="lock-closed" size={8} color="#F6F4EE" />
            </View>
          ) : null}
        </View>

        {effect === 'stars' ? (
          <FallingStars size={size} glyphs={glyphs} seed={pinSeed} />
        ) : null}
      </View>

      {/* Point dot */}
      <View
        style={styled ? { backgroundColor: pinColor } : undefined}
        className={[
          'mt-1 h-1.5 w-1.5 rounded-full',
          selected
            ? 'bg-text-light dark:bg-text-dark'
            : styled
              ? ''
              : hosted
                ? 'bg-accent-400'
                : 'bg-text-light/80 dark:bg-text-dark/80',
        ].join(' ')}
      />
      {title && !compact ? (
        <View className="mt-1 rounded-full bg-text-light/85 px-2 py-0.5 dark:bg-text-dark/85">
          <Text className="text-[10px] font-semibold text-surface-light dark:text-surface-dark" numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** "You're placing a marker here" state — the only place coral appears
 *  on the map alongside the create FAB. */
export function PendingMarker({ label }: { label: string }) {
  return (
    <View className="items-center">
      <View
        className="items-center justify-center rounded-2xl border border-accent-400 bg-accent-400 shadow-lg shadow-black/30"
        style={{ width: 44, height: 44, borderBottomLeftRadius: 4 }}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </View>
      <View className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-400" />
      <View className="mt-1 rounded-full bg-accent-400 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-white">{label}</Text>
      </View>
    </View>
  );
}
