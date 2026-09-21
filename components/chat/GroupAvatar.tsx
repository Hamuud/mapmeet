import { Image, Text, View } from 'react-native';

/** A group's photo, or its emoji when it has none.
 *
 *  One component because the fallback rule has to be identical in the
 *  three places a group is drawn — the room header, the chat list, and
 *  the edit sheet. Written out at each site, one of them would sooner
 *  or later keep showing the emoji after a photo was set. */
export function GroupAvatar({
  emoji,
  avatarUrl,
  size,
  radius,
}: {
  emoji: string;
  avatarUrl?: string | null;
  size: number;
  /** Defaults to the app's squircle-ish corner for this size. */
  radius?: number;
}) {
  const r = radius ?? Math.round(size * 0.32);

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      className="items-center justify-center bg-elevated-light dark:bg-elevated-dark"
      style={{ width: size, height: size, borderRadius: r }}
    >
      <Text style={{ fontSize: Math.round(size * 0.5) }}>{emoji}</Text>
    </View>
  );
}
