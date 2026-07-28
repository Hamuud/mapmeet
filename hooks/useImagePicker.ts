import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';

/** A picked attachment: local uri + whether it's a photo or a video. */
export type PickedMedia = {
  uri: string;
  kind: 'image' | 'video';
  /** Bytes, when the picker reports it — lets callers reject huge files. */
  size?: number;
};

/** Wraps expo-image-picker's library flow. Returns null when the user
 *  cancels — screens should treat that as a no-op, not an error. */
export function useImagePicker() {
  const pickFromLibrary = useCallback(async (): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0].uri;
  }, []);

  /** Pick photos and/or videos (multi-select where the OS supports it) —
   *  used by the feedback composer so a bug report can carry evidence.
   *  Returns [] on cancel or when permission is denied. */
  const pickMedia = useCallback(
    async (selectionLimit = 5): Promise<PickedMedia[]> => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return [];
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit,
      });
      if (result.canceled) return [];
      return (result.assets ?? []).map((a) => ({
        uri: a.uri,
        kind: a.type === 'video' ? 'video' : 'image',
        size: a.fileSize,
      }));
    },
    [],
  );

  return { pickFromLibrary, pickMedia };
}
