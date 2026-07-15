/** Coerce raw user input into a shape that matches the SQL check
 *  constraint on events.tags: any 2–24 characters with no whitespace.
 *  We keep Unicode letters intact (Cyrillic, Chinese, emoji…) so
 *  non-English tags survive round-trip; whitespace + `/` + `,` collapse
 *  to dashes so multi-word input like "coffee tour" becomes a single tag.
 *
 *  `toLocaleLowerCase()` does the right thing across scripts (Turkish
 *  dotted-i, German ß, Greek sigma) — plain toLowerCase misses those.
 *  Returns null when the result is too short so the caller can skip it. */
export function normalizeTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLocaleLowerCase()
    // Collapse whitespace, slash, comma into a single dash so
    // "coffee tour" / "one, two" turn into commit-ready single tokens.
    .replace(/[\s/,]+/g, '-')
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
