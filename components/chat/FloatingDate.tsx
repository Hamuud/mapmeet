import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { currentBcp47, useT, type TFunction } from '@/i18n';

/** "Today" / "Yesterday" / "Wed 29 Jul" for a message timestamp. */
export function dayLabel(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return t('time.today');
  if (sameDay(d, yesterday)) return t('time.yesterday');
  return d.toLocaleDateString(currentBcp47(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Calendar-day key for grouping messages. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The date of whatever you are currently looking at, floating over the
 *  top of the thread.
 *
 *  This replaces a rule-and-label separator drawn between every change
 *  of day. Those were permanent furniture for occasional information:
 *  in a chat that runs for weeks they cut the thread into slices, and
 *  the one thing a reader actually wants to know — "when was this?" —
 *  is only asked while scrolling. So it is shown while scrolling, and
 *  the rest of the time the messages are left alone.
 *
 *  Absolutely positioned rather than in the flow, so appearing and
 *  disappearing never moves a message under the reader's thumb. */
export function FloatingDate({
  iso,
  visible,
  top,
}: {
  iso: string | null;
  visible: boolean;
  /** Clears the room header. */
  top: number;
}) {
  const t = useT();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: visible && iso ? 1 : 0,
      // Quick in, slower out: it should be there the moment you start
      // moving, and leave without drawing attention to itself.
      duration: visible ? 120 : 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, iso, v]);

  if (!iso) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
        ],
      }}
    >
      <View className="rounded-full bg-elevated-light/95 px-3 py-1 shadow-sm shadow-black/10 dark:bg-elevated-dark/95">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light dark:text-muted-dark">
          {dayLabel(iso, t)}
        </Text>
      </View>
    </Animated.View>
  );
}
