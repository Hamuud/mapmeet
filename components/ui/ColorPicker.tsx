import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';

import { useScrollLockStore } from '@/store/scrollLock.store';
import { BLACK_RAMP, HUE_RAMP, WHITE_RAMP } from './gradientRamps';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '@/utils/color';

const SQUARE_HEIGHT = 170;
const STRIP_HEIGHT = 26;

type Props = {
  /** Current colour as `#RRGGBB`. Anything unparseable starts the picker
   *  on plain red rather than throwing — a colour picker is not the
   *  place to be strict about its input. */
  value: string;
  onChange: (hex: string) => void;
};

/** Saturation/brightness square with a hue strip under it — the picker
 *  everyone already knows from Photoshop, Figma and every OS colour
 *  dialog.
 *
 *  Hue is kept in component state rather than read back out of the hex
 *  on every render, and that is the whole trick to making it feel right.
 *  Black and white have no hue: drag brightness to zero and the round
 *  trip through `#000000` reports hue 0, which would snap the strip back
 *  to red and lose the user's place. Holding H, S and V lets the square
 *  keep its hue while the colour underneath goes to black and back. */
export function ColorPicker({ value, onChange }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 1, v: 1 });

  // Re-sync when the colour arrives from somewhere else — a swatch tap,
  // or the hex field being typed into. React's documented way to adjust
  // state from a prop: compare during render and set, which re-runs this
  // component before anything is drawn. Comparing through the hex we
  // last emitted is what stops our own onChange bouncing back and
  // fighting a drag in progress.
  const [syncedTo, setSyncedTo] = useState(value.toUpperCase());
  if (value.toUpperCase() !== syncedTo) {
    setSyncedTo(value.toUpperCase());
    const next = hexToHsv(value);
    // Keep the hue when the incoming colour has none of its own, for the
    // same reason this state exists at all.
    if (next) {
      setHsv((prev) => ({
        ...next,
        h: next.s === 0 || next.v === 0 ? prev.h : next.h,
      }));
    }
  }

  const emit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setSyncedTo(hex);
    onChange(hex);
  };

  const [square, setSquare] = useState({ w: 1, h: 1 });
  const [stripW, setStripW] = useState(1);

  // Refs so the pan handlers, which are created once, always read the
  // current size and hue instead of the ones from first render.
  const squareRef = useRef(square);
  squareRef.current = square;
  const stripRef = useRef(stripW);
  stripRef.current = stripW;
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Zustand actions keep the same identity for the life of the store, so
  // the copy the pan handlers capture on first render stays good.
  const lockScroll = useScrollLockStore((s) => s.setLocked);
  // Releasing on unmount as well: closing the sheet mid-drag fires
  // neither release nor terminate, and a lock left set would freeze the
  // next sheet that opened.
  useEffect(() => () => lockScroll(false), [lockScroll]);

  const pureHue = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: 1 }), [hsv.h]);
  const current = useMemo(() => hsvToHex(hsv), [hsv]);
  const knobInk = luminance(current) > 0.6 ? '#0E0E10' : '#FFFFFF';

  /** locationX/Y are relative to the responder view, which is what we
   *  want — but only while every child is `pointerEvents="none"`, or a
   *  slice becomes the target and the numbers are relative to that
   *  instead. That is why the overlays and knobs below are all inert. */
  /** Both controls behave identically towards the scroll view they sit
   *  in: they take the gesture on touch-down and hold it until the
   *  finger lifts.
   *
   *  Claiming the JS responder is only half of it. The sheet's
   *  ScrollView scrolls through a native pan recogniser that does not
   *  defer to the responder system, so dragging down the square to
   *  lower brightness scrolled the sheet underneath at the same time.
   *  Freezing it for the length of the drag is what stops that — and
   *  the unlock has to happen on terminate as well as release, or one
   *  interrupted gesture leaves the sheet stuck.
   *
   *  The gesture staying with the control once it has begun is the
   *  point, not a side effect: dragging past the edge of the square
   *  keeps adjusting the colour, clamped, rather than handing the
   *  gesture back mid-choice. Scrolling is available again as soon as
   *  the finger lifts. */
  const dragHandlers = (apply: (e: GestureResponderEvent) => void) => ({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e: GestureResponderEvent) => {
      lockScroll(true);
      apply(e);
    },
    onPanResponderMove: apply,
    onPanResponderRelease: () => lockScroll(false),
    onPanResponderTerminate: () => lockScroll(false),
  });

  const squarePan = useRef(PanResponder.create(dragHandlers((e) => fromSquare(e)))).current;
  const stripPan = useRef(PanResponder.create(dragHandlers((e) => fromStrip(e)))).current;

  function fromSquare(e: GestureResponderEvent) {
    const { w, h } = squareRef.current;
    const x = Math.min(Math.max(e.nativeEvent.locationX, 0), w);
    const y = Math.min(Math.max(e.nativeEvent.locationY, 0), h);
    // Left→right is saturation, top→bottom is falling brightness. That
    // is the arrangement every other picker uses; inverting either is
    // the kind of surprise nobody thanks you for.
    emit({ h: hsvRef.current.h, s: x / w, v: 1 - y / h });
  }

  function fromStrip(e: GestureResponderEvent) {
    const w = stripRef.current;
    const x = Math.min(Math.max(e.nativeEvent.locationX, 0), w);
    emit({ ...hsvRef.current, h: (x / w) * 360 });
  }

  const onSquareLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSquare({ w: width, h: height });
  };

  return (
    <View className="gap-3">
      {/* Saturation × brightness. Solid hue underneath, a white ramp
          across it and a black ramp down it — which is exactly how the
          square is defined, so the approximation is only in the number
          of steps, not in the maths. */}
      <View
        onLayout={onSquareLayout}
        {...squarePan.panHandlers}
        style={{
          height: SQUARE_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: pureHue,
        }}
        accessibilityLabel="Saturation and brightness"
      >
        {/* Saturation, then value. Both stretched from a one-pixel strip,
            so the steps between are the GPU's bilinear filtering rather
            than anything laid out — no slice boundaries to show through
            at any size or pixel density. */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={{ uri: WHITE_RAMP }}
            resizeMode="stretch"
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={{ uri: BLACK_RAMP }}
            resizeMode="stretch"
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hsv.s * square.w - 11,
            top: (1 - hsv.v) * square.h - 11,
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2.5,
            borderColor: knobInk,
            backgroundColor: current,
          }}
        />
      </View>

      {/* Hue. */}
      <View
        onLayout={(e) => setStripW(Math.max(1, e.nativeEvent.layout.width))}
        {...stripPan.panHandlers}
        style={{ height: STRIP_HEIGHT, borderRadius: STRIP_HEIGHT / 2, overflow: 'hidden' }}
        accessibilityLabel="Hue"
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={{ uri: HUE_RAMP }}
            resizeMode="stretch"
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (hsv.h / 360) * stripW - 11,
            top: (STRIP_HEIGHT - 22) / 2,
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            backgroundColor: pureHue,
          }}
        />
      </View>
    </View>
  );
}
