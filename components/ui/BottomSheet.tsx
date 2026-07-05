import { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height as a fraction of the container. 0..1 */
  heightPct?: number;
};

/** Bottom sheet that renders in-tree, not inside a `<Modal>`.
 *
 *  Position is set with explicit `position: absolute; bottom: 0` on the
 *  sheet body (rather than a flex `justify-end`) — combining `%` height
 *  with a flex layout inside an absolute-positioned parent was letting
 *  iOS render the sheet in the top-left instead of the bottom. Being
 *  explicit removes the ambiguity.
 *
 *  Also supports swipe-down to dismiss: a PanResponder attached to the
 *  handle area translates the sheet down as the user drags; on release,
 *  a threshold either commits the close or springs back. */
export function BottomSheet({ open, onClose, children, heightPct = 0.6 }: Props) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (open) dragY.setValue(0);
  }, [open, progress, dragY]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // Drag-to-close. Fires from the handle area only — we don't want to
  // hijack the ScrollView's vertical pan inside the sheet body.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        // Either far enough (100pt) or fast enough (flick down) commits.
        if (g.dy > 100 || g.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
    }),
  ).current;

  if (!open) return null;

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });
  const enterTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });
  const combinedTranslate = Animated.add(enterTranslate, dragY);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}
      >
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close sheet"
          style={{ flex: 1, backgroundColor: 'black' }}
        />
      </Animated.View>

      {/* Sheet body — explicit bottom-of-parent placement so iOS lays it
          out consistently regardless of any NativeWind flex quirks. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${heightPct * 100}%`,
          transform: [{ translateY: combinedTranslate }],
        }}
        className="overflow-hidden rounded-t-3xl border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
      >
        {/* Handle — pan target for swipe-down-to-close. */}
        <View
          className="items-center pt-3 pb-2"
          {...panResponder.panHandlers}
        >
          <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
        </View>
        <View className="flex-1 px-5 pb-6">{children}</View>
      </Animated.View>
    </View>
  );
}
