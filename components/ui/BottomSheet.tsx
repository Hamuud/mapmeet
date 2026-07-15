import { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height as a fraction of the viewport. 0..1 */
  heightPct?: number;
  /** Web only: shrink the sheet to its content (capped at `heightPct`)
   *  instead of always filling `heightPct` of the viewport. Use on short
   *  peek-style sheets so the primary actions dock right above the tab
   *  bar without a huge empty gap below on tall/wide viewports. */
  autoHeight?: boolean;
};

/** Bottom sheet — in-tree, not inside `<Modal>`.
 *
 *  Native path uses RN's Animated for slide + backdrop fade and a
 *  PanResponder on the handle for swipe-to-dismiss.
 *
 *  Web path skips Animated entirely — react-native-web's Animated
 *  interpolation on `translateY` + `opacity` doesn't reliably run and
 *  we saw the peek rendering at translateY=initial with a 0-opacity
 *  backdrop (sheet stuck near the top of the viewport, backdrop
 *  transparent, layout showing through the map). Web gets a solid
 *  rgba backdrop and an explicit pixel-height sheet — visually identical,
 *  no animation drift. */
export function BottomSheet({
  open,
  onClose,
  children,
  heightPct = 0.6,
  autoHeight = false,
}: Props) {
  const isWeb = Platform.OS === 'web';
  const { height: winHeight } = useWindowDimensions();
  const sheetHeightPx = Math.round(winHeight * heightPct);

  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isWeb) return; // web bypasses Animated entirely
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (open) dragY.setValue(0);
  }, [open, progress, dragY, isWeb]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
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

  // ── Web path — no Animated, solid inline styles ────────────────────
  if (isWeb) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close sheet"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(14, 14, 16, 0.45)',
          }}
        />
        <View
          className="border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            // autoHeight: shrink to content, cap at heightPct so long lists
            // still get a scroll region. Fixed: always exactly heightPct.
            ...(autoHeight
              ? { maxHeight: sheetHeightPx }
              : { height: sheetHeightPx }),
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
            // Belt-and-braces solid fill for the panel — some
            // NativeWind CSS ordering on web has bg-panel-light lose to
            // an inherited transparent background.
            backgroundColor: '#FDFCF8',
          }}
        >
          <View className="items-center pt-3 pb-2">
            <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
          </View>
          {/* When shrinking to content, don't force the inner column to
              flex-1 — that would re-stretch it to the parent's max-height
              (which the browser measures as the fallback) and reintroduce
              the empty gap we're trying to kill. */}
          <View
            className={autoHeight ? 'px-5 pb-6' : 'flex-1 px-5 pb-6'}
          >
            {children}
          </View>
        </View>
      </View>
    );
  }

  // ── Native path — Animated slide + fade + PanResponder ─────────────
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
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}
      >
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close sheet"
          style={{ flex: 1, backgroundColor: 'black' }}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetHeightPx,
          transform: [{ translateY: combinedTranslate }],
        }}
        className="overflow-hidden rounded-t-3xl border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
      >
        <View className="items-center pt-3 pb-2" {...panResponder.panHandlers}>
          <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
        </View>
        <View className="flex-1 px-5 pb-6">{children}</View>
      </Animated.View>
    </View>
  );
}
