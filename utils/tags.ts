/** Coerce raw user input into a shape that matches the SQL check
 *  constraint on events.tags: lowercased, spaces + underscores + slashes
 *  collapsed into dashes, trimmed to 24 chars. Returns null when the
 *  result is too short so the caller can skip it. */
export function normalizeTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return cleaned.length >= 2 ? cleaned : null;
}

/** Add a tag to a list, keeping order + dedup + max-length constraint. */
export function appendTag(list: string[], raw: string): string[] {
  const normalized = normalizeTag(raw);
  if (!normalized || list.includes(normalized) || list.length >= 5) return list;
  return [...list, normalized];
}
