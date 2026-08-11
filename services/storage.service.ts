import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Reads a local file (native) or fetches a data/blob URI (web) and
 *  returns a Uint8Array — the shape supabase-js accepts everywhere. */
async function readAsBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web' || uri.startsWith('data:') || uri.startsWith('blob:')) {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Fast enough for a single ~1MB image; skips pulling in a base64 lib.
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : // React Native doesn't ship atob until Hermes 0.72+; guard for old runtimes.
        Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function inferContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

/** Content type for feedback attachments, which can be video too. */
function inferMediaContentType(uri: string, kind: 'image' | 'video'): string {
  const lower = uri.split('?')[0]?.toLowerCase() ?? '';
  if (kind === 'video') {
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.m4v')) return 'video/x-m4v';
    return 'video/mp4';
  }
  return inferContentType(lower);
}

export const storageService = {
  async uploadAvatar(userId: string, localUri: string): Promise<string> {
    const bytes = await readAsBytes(localUri);
    const contentType = inferContentType(localUri);
    const ext = contentType.split('/')[1] ?? 'jpg';
    // Bust the CDN cache by suffixing a timestamp — the DB stores the
    // returned public URL so it doesn't matter if the path changes.
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (error) throw error;

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Remove every avatar the user has ever uploaded, on account
   *  deletion. Storage does not cascade, and SQL is forbidden from
   *  deleting storage.objects, so this has to go through the API — the
   *  "owner delete own avatar" policy scopes it to your own prefix.
   *  Best-effort: a storage hiccup must not block the deletion itself. */
  async removeAvatars(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase.storage.from('avatars').list(userId);
      if (error || !data?.length) return;
      await supabase.storage
        .from('avatars')
        .remove(data.map((f) => `${userId}/${f.name}`));
    } catch {
      // Swallowed on purpose — see the doc comment.
    }
  },

  /** Upload one feedback attachment (photo or video). Keyed under the
   *  sender's uid — the bucket policy only allows writes to that prefix. */
  async uploadFeedbackMedia(
    userId: string,
    localUri: string,
    kind: 'image' | 'video',
  ): Promise<string> {
    const bytes = await readAsBytes(localUri);
    const contentType = inferMediaContentType(localUri, kind);
    const ext = (contentType.split('/')[1] ?? (kind === 'video' ? 'mp4' : 'jpg'))
      .replace('quicktime', 'mov')
      .replace('x-m4v', 'm4v');
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('feedback-media')
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from('feedback-media').getPublicUrl(path);
    return data.publicUrl;
  },
};
