import { Pressable, Text, View } from 'react-native';

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
};

/** Right-side desktop zoom stack — Zoom+ / Zoom− / My Location.
 *  Matches the mockup's small-square design with hairline borders and
 *  a distinctive crosshair icon on the locate button. */
export function MapZoomStack({ onZoomIn, onZoomOut, onLocate }: Props) {
  return (
    <View className="items-center gap-2" pointerEvents="box-none">
      <ZoomButton onPress={onZoomIn} accessibilityLabel="Zoom in">
        <Text className="text-lg font-semibold text-text-light dark:text-text-dark">+</Text>
      </ZoomButton>
      <ZoomButton onPress={onZoomOut} accessibilityLabel="Zoom out">
        <Text className="text-lg font-semibold text-text-light dark:text-text-dark">−</Text>
      </ZoomButton>
      <ZoomButton onPress={onLocate} accessibilityLabel="My location">
        <Crosshair />
      </ZoomButton>
    </View>
  );
}

function ZoomButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      className="h-11 w-11 items-center justify-center rounded-xl border border-border-light bg-panel-light shadow-sm shadow-black/10 active:opacity-70 dark:border-border-dark dark:bg-panel-dark"
    >
      {children}
    </Pressable>
  );
}

// A distinctive crosshair — four short strokes pointing into a center
// dot. Renders identically on native and web without an SVG dependency.
function Crosshair() {
  return (
    <View className="h-4 w-4 items-center justify-center">
      {/* horizontals */}
      <View className="absolute left-0 h-[1.5px] w-1.5 rounded-full bg-text-light dark:bg-text-dark" />
      <View className="absolute right-0 h-[1.5px] w-1.5 rounded-full bg-text-light dark:bg-text-dark" />
      {/* verticals */}
      <View className="absolute top-0 h-1.5 w-[1.5px] rounded-full bg-text-light dark:bg-text-dark" />
      <View className="absolute bottom-0 h-1.5 w-[1.5px] rounded-full bg-text-light dark:bg-text-dark" />
      {/* dot */}
      <View className="h-1 w-1 rounded-full bg-text-light dark:bg-text-dark" />
    </View>
  );
}
