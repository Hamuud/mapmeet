import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { useT } from '@/i18n';

/** Show the button once the reader is this far from the newest message.
 *  Roughly a screen and a half: far enough that scrolling back by hand
 *  is a chore, near enough that it does not appear over a small nudge. */
export const JUMP_THRESHOLD = 600;

type Props = {
  visible: boolean;
  /** Unread that arrived while scrolled away, if known. */
  count?: number;
  onPress: () => void;
  /** Lifts the button clear of the composer. */
  bottom: number;
};

/** "Back to the newest message", with the count of what landed while
 *  you were reading.
 *
 *  Scrolled up in a long chat, the only way back was to flick until the
 *  list ran out — and on an inverted list the newest end is the top,
 *  which is not where a thumb reaches for. The count matters as much as
 *  the button: it answers "did I miss anything" without making you go
 *  and look. */
export function JumpToLatest({ visible, count = 0, onPress, bottom }: Props) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, v]);

  return (
    <Animated.View
      // Inert when hidden, or an invisible button still swallows taps
      // meant for the message underneath it.
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        right: 14,
        bottom,
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityLabel={
          count > 0 ? `${count} new messages, jump to latest` : 'Jump to latest'
        }
        className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-panel-light shadow-md shadow-black/20 dark:border-border-dark dark:bg-panel-dark"
      >
        <Ionicons name="arrow-down" size={18} color="#4B5FE0" />
      </Pressable>
      {count > 0 ? (
        <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-400 px-1">
          <Text className="text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
