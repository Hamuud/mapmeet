import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
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
  /** Shrink the sheet to its content, capped at `heightPct`. On web
   *  this uses `max-height` and content-flow sizing; on native we
   *  measure the content via `onLayout` and clamp the animated
   *  container's height to the measured value. Use on short peek-style
   *  sheets so the primary actions dock right above the tab bar
   *  without a huge empty gap below on tall viewports. */
  autoHeight?: boolean;
  /** On desktop web (≥ `desktopWidth`), render the sheet as a floating
   *  right-side rail (mirror of the left MapSidebar) that slides up
   *  from the bottom instead of docking to the bottom edge full-width.
   *  Falls back to the standard bottom sheet on narrower viewports and
   *  on native. Used by the Pin/Edit sheets to stay usable on a
   *  desktop map where a full-width bottom sheet would cover half the
   *  content. */
  desktopRail?: boolean;
  /** Width breakpoint (px) at which `desktopRail` kicks in. */
  desktopWidth?: number;
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
  desktopRail = false,
  desktopWidth = 900,
}: Props) {
  const isWeb = Platform.OS === 'web';
  const { height: winHeight, width: winWidth } = useWindowDimensions();
  const sheetHeightPx = Math.round(winHeight * heightPct);
  const useDesktopRail = isWeb && desktopRail && winWidth >= desktopWidth;

  // Web slide-in state. `mounted` controls presence in the tree,
  // `entered` controls the transform + opacity — flipping `entered`
  // one animation frame after mount is what actually triggers the
  // CSS transition to run instead of snapping.
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!isWeb) return;
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    if (mounted) {
      setEntered(false);
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
    return;
  }, [open, isWeb, mounted]);

  // Native autoHeight: measured content height, capped at
  // sheetHeightPx. Start unset so the first frame doesn't flash a
  // stale value from a previous open; we render the sheet with
  // opacity: 0 until we have a measurement, then reveal it.
  const [measuredContentPx, setMeasuredContentPx] = useState<number | null>(null);
  useEffect(() => {
    // Reset when the sheet is reopened so a taller/shorter payload
    // (e.g. attendees now loaded) triggers a fresh measurement.
    if (!open) setMeasuredContentPx(null);
  }, [open]);
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > 0 && h !== measuredContentPx) setMeasuredContentPx(h);
  };

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

  // Web keeps the sheet mounted through the exit transition so the
  // slide-out animation can run before unmount. Native still hard-
  // unmounts on !open.
  if (isWeb ? !mounted : !open) return null;

  // ── Web path — no RN Animated, CSS transition on transform + opacity ─
  if (isWeb) {
    // Desktop rail: floating right panel that mirrors MapSidebar's
    // left-rail geometry. On viewports < desktopWidth we fall through
    // to the standard bottom sheet.
    if (useDesktopRail) {
      // Slightly wider than the left rail (330px) because the sheet's
      // form fields need room, but capped so we don't crowd the map.
      const railWidth = 380;
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
              backgroundColor: 'rgba(14, 14, 16, 0.35)',
              opacity: entered ? 1 : 0,
              // `transition` is honored by react-native-web; RN-Animated's
              // opacity interpolation on web is what we already avoided.
              transition: 'opacity 260ms cubic-bezier(0.22, 0.9, 0.35, 1)',
            } as any}
          />
          <View
            className="border border-border-light bg-panel-light shadow-lg shadow-black/25 dark:border-border-dark dark:bg-panel-dark"
            style={{
              position: 'absolute',
              right: 20,
              top: 20,
              bottom: 20,
              width: railWidth,
              borderRadius: 24,
              overflow: 'hidden',
              backgroundColor: '#FDFCF8',
              transform: entered
                ? ([{ translateY: 0 }] as any)
                : ([{ translateY: winHeight }] as any),
              opacity: entered ? 1 : 0,
              transition:
                'transform 260ms cubic-bezier(0.22, 0.9, 0.35, 1), opacity 200ms ease',
            } as any}
          >
            <View className="flex-1 px-5 py-6">{children}</View>
          </View>
        </View>
      );
    }

    // Standard web bottom sheet (mobile / narrow desktop).
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
            opacity: entered ? 1 : 0,
            transition: 'opacity 200ms ease',
          } as any}
        />
        <View
          className="border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            ...(autoHeight
              ? { maxHeight: sheetHeightPx }
              : { height: sheetHeightPx }),
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
            backgroundColor: '#FDFCF8',
            transform: entered
              ? ([{ translateY: 0 }] as any)
              : ([{ translateY: winHeight }] as any),
            transition:
              'transform 220ms cubic-bezier(0.22, 0.9, 0.35, 1)',
          } as any}
        >
          <View className="items-center pt-3 pb-2">
            <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
          </View>
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
          // autoHeight (native): once onLayout has reported the
          // intrinsic content height, snap the animated container to
          // that. Before we have a measurement, use the full slot but
          // render with opacity: 0 so the measurement pass isn't
          // visible (avoids a one-frame flash of the tall sheet).
          height:
            autoHeight && measuredContentPx != null
              ? Math.min(measuredContentPx, sheetHeightPx)
              : sheetHeightPx,
          transform: [{ translateY: combinedTranslate }],
          opacity: autoHeight && measuredContentPx == null ? 0 : 1,
        }}
        className="overflow-hidden rounded-t-3xl border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
      >
        {autoHeight ? (
          // AutoHeight branch: wrap in an onLayout probe so we can
          // measure handle + content together and snap the animated
          // container to that height.
          <View onLayout={onContentLayout}>
            <View className="items-center pt-3 pb-2" {...panResponder.panHandlers}>
              <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
            </View>
            <View className="px-5 pb-6">{children}</View>
          </View>
        ) : (
          // Fixed-height branch: children are direct children of the
          // Animated.View so `flex-1` on the content wrapper actually
          // fills the sheet. Wrapping them in an extra <View> with no
          // flex-1 (as we do for autoHeight) collapses the child, and
          // the sheet ends up rendering blank — nothing but the close
          // button pokes through.
          <>
            <View className="items-center pt-3 pb-2" {...panResponder.panHandlers}>
              <View className="h-1.5 w-10 rounded-full bg-border-light dark:bg-border-dark" />
            </View>
            <View className="flex-1 px-5 pb-6">{children}</View>
          </>
        )}
      </Animated.View>
    </View>
  );
}
