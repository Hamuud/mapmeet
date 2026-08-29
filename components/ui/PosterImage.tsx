import { useState } from 'react';
import { Image, View, type LayoutChangeEvent } from 'react-native';

/** Where the visible window starts, as a fraction of the poster's full
 *  height.
 *
 *  Small on purpose. The instinct is to nudge further down, past the
 *  margin a poster usually carries — but these posters put the headline
 *  right at the top edge, and 6% was enough to slice through a line of
 *  it. A crop that cuts a title in half is worse than one that includes
 *  a little dead space above it, so the bias only clears a hairline of
 *  border and stops. */
const TOP_BIAS = 0.02;

type Props = {
  uri: string;
  /** Visible height. The poster is cropped to it, from the top. */
  height: number;
  accessibilityLabel?: string;
  /** Corner radius of the crop window. */
  radius?: number;
};

/** An event poster, cropped from the top rather than the middle.
 *
 *  `resizeMode="cover"` always crops around the centre, and there is no
 *  way to tell it otherwise — RN has no `contentPosition`, and the
 *  library that does (expo-image) is not installed here. On a portrait
 *  poster in a short, wide window that centre crop is brutal: a 2:3
 *  poster scaled to ~340pt wide is ~510pt tall, so a 132pt window shows
 *  a 26% band taken from the middle. The title, the act, the artwork —
 *  everything that identifies the event — is above it, and what is left
 *  is a stretch of background. That is the "impossible to make out
 *  anything on them" case.
 *
 *  So this measures instead. `onLoad` reports the poster's real pixel
 *  size, the container reports its own width, and between them the
 *  poster is laid out at its natural aspect and slid up so the window
 *  sits near the top. Landscape posters, which are shorter than the
 *  window once scaled, are left alone and simply cover it.
 *
 *  Until the size is known it falls back to a plain centred cover, so
 *  the first frame is a poster rather than a hole. */
export function PosterImage({ uri, height, accessibilityLabel, radius = 16 }: Props) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };

  const measured = ratio != null && ratio > 0 && width > 0;
  // What the poster's height would be at full container width.
  const naturalHeight = measured ? width / ratio! : height;
  // Slide up by the bias, but never so far that we run off the bottom —
  // a poster only slightly taller than the window should not leave a gap
  // under it.
  const offset = measured
    ? Math.min(Math.max(TOP_BIAS * naturalHeight, 0), Math.max(0, naturalHeight - height))
    : 0;

  return (
    <View
      onLayout={onLayout}
      style={{ width: '100%', height, borderRadius: radius, overflow: 'hidden' }}
    >
      <Image
        source={{ uri }}
        accessibilityLabel={accessibilityLabel}
        onLoad={(e) => {
          const s = e.nativeEvent.source;
          if (s?.width && s?.height) setRatio(s.width / s.height);
        }}
        resizeMode="cover"
        style={
          measured
            ? { position: 'absolute', top: -offset, left: 0, width, height: naturalHeight }
            : { width: '100%', height }
        }
      />
    </View>
  );
}
