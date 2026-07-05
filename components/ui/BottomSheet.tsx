import { Modal, Pressable, View } from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height as a fraction of the viewport. 0..1 */
  heightPct?: number;
};

/** Cross-platform bottom sheet. Backed by React Native's `<Modal>`
 *  with native slide-in animation. We used to run our own Reanimated
 *  translation on `Animated.View` for the slide + backdrop opacity,
 *  but a race between Reanimated's shared-value updates and iOS's
 *  modal presentation was breaking touch handling on iOS 18 — the
 *  peek would render but every button inside it went unresponsive.
 *
 *  Native `animationType="slide"` gives us the same visual with zero
 *  JS in the touch path, so tap handling is rock-solid. */
export function BottomSheet({ open, onClose, children, heightPct = 0.6 }: Props) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — tap anywhere above the sheet to dismiss. */}
        <Pressable
          className="absolute inset-0 bg-black/55"
          onPress={onClose}
          accessibilityLabel="Close sheet"
        />
        <View
          style={{ height: `${heightPct * 100}%` }}
          className="overflow-hidden rounded-t-3xl border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
        >
          <View className="flex-1">
            <View className="items-center pt-2 pb-1">
              <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
            </View>
            <View className="flex-1 px-5 pb-6">{children}</View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
