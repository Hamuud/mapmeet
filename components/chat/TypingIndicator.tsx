import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useT } from '@/i18n';

/** Three dots that rise and fall in sequence.
 *
 *  The one place in this app where a looping animation earns itself:
 *  it is not decoration, it is the state. "Typing" means something is
 *  happening right now, and a still caption cannot say that — it reads
 *  the same whether the connection is live or died a minute ago. The
 *  motion IS the liveness. */
function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        // The tail of the cycle, so the three dots stay in step rather
        // than drifting against each other.
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#8B8880',
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
        ],
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      }}
    />
  );
}

/** "Ana is typing" / "Ana and Bo are typing" / "3 people are typing".
 *
 *  Renders nothing when nobody is, rather than reserving a row — an
 *  empty strip above the composer is a permanent cost for an occasional
 *  message. It sits inside the inverted list's header, which on an
 *  inverted list is the bottom, so it appears just above the newest
 *  message and pushes nothing around. */
export function TypingIndicator({ names }: { names: string[] }) {
  const t = useT();
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? t('typing.one', { name: names[0]! })
      : names.length === 2
        ? t('typing.two', { a: names[0]!, b: names[1]! })
        : t('typing.many', { count: names.length });

  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-1.5">
      <View className="flex-row items-end gap-1 pb-0.5">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
      <Text
        className="flex-1 text-[12px] italic text-muted-light dark:text-muted-dark"
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
