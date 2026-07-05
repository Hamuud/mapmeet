import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, Pressable, View } from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height as a fraction of the container. 0..1 */
  heightPct?: number;
};

/** Bottom sheet that renders in-tree, not inside a `<Modal>`.
 *
 *  We tried `<Modal>` earlier — first with a Reanimated slide, then
 *  with `animationType="slide"`. Both variants hit the same iOS bug:
 *  UIKit gets confused when a modal dismisses on the same tick another
 *  one presents (Directions button = close preview + open directions),
 *  the second modal never shows, and every subsequent tap on the map
 *  is eaten by a phantom UIViewController. Users saw the map lock up
 *  completely after tapping Directions.
 *
 *  Fix: render the sheet as an absolute-positioned overlay INSIDE the
 *  screen tree. No native modal stack to fight with; RN's Animated
 *  (not Reanimated) drives a smooth slide + backdrop fade purely on
 *  the UI thread. All buttons stay responsive, and multiple "sheets"
 *  can crossfade in the same tick without any conflict. */
export function BottomSheet({ open, onClose, children, heightPct = 0.6 }: Props) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  // Hardware back on Android should close the sheet.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // Guard against tap-through: when closed, the whole overlay
  // unmounts. The Animated.Value trailing to 0 happens in the same
  // frame, so we don't hold on to visuals after close.
  if (!open) return null;

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });
  const sheetTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <View className="absolute inset-0 justify-end" pointerEvents="box-none">
      {/* Backdrop — its own Animated.View so opacity fades cleanly. */}
      <Animated.View style={{ opacity: backdropOpacity }} className="absolute inset-0">
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close sheet"
          className="flex-1 bg-black"
        />
      </Animated.View>

      {/* Sheet body */}
      <Animated.View
        style={{
          height: `${heightPct * 100}%`,
          transform: [{ translateY: sheetTranslate }],
        }}
        className="overflow-hidden rounded-t-3xl border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
      >
        <View className="flex-1">
          <View className="items-center pt-2 pb-1">
            <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
          </View>
          <View className="flex-1 px-5 pb-6">{children}</View>
        </View>
      </Animated.View>
    </View>
  );
}
