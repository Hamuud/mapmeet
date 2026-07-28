import { supabase } from './supabase';

const BUCKET = 'chat-media';
/** How long a minted URL stays valid. Long enough that a chat left open
 *  keeps playing, short enough that a leaked link dies the same day. */
const TTL_SECONDS = 6 * 60 * 60;
/** Re-sign this long before expiry so an in-flight render never 400s. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

/** Storage path for a chat attachment.
 *
 *  Accepts either the path we store now, or a legacy absolute public URL
 *  (`…/object/public/chat-media/<path>`) from before the bucket went
 *  private — so old messages keep resolving. */
export function chatMediaPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
  const marker = `/${BUCKET}/`;
  const at = value.indexOf(marker);
  if (at === -1) return null;
  const raw = value.slice(at + marker.length).split('?')[0] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Mint (or reuse) signed URLs for a batch of paths. Failures are simply
 *  omitted — the caller leaves that message's media unresolved rather
 *  than blowing up the whole conversation. */
export async function signChatMedia(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];

  for (const p of new Set(paths)) {
    const hit = cache.get(p);
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now) out.set(p, hit.url);
    else missing.push(p);
  }
  if (missing.length === 0) return out;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, TTL_SECONDS);
  if (error || !data) return out;

  const expiresAt = now + TTL_SECONDS * 1000;
  for (const row of data) {
    if (!row.signedUrl || !row.path) continue;
    cache.set(row.path, { url: row.signedUrl, expiresAt });
    out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Swap `media_url` on each row for a signed URL the UI can render
 *  directly, so screens stay unaware the bucket is private. */
export async function withSignedMedia<T extends { media_url: string | null }>(
  rows: T[],
): Promise<T[]> {
  const paths = rows
    .map((r) => chatMediaPath(r.media_url))
    .filter((p): p is string => !!p);
  if (paths.length === 0) return rows;

  const signed = await signChatMedia(paths);
  return rows.map((row) => {
    const path = chatMediaPath(row.media_url);
    const url = path ? signed.get(path) : undefined;
    return url ? { ...row, media_url: url } : row;
  });
}
