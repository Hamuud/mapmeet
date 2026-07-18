/** Which emojis a map cluster shows instead of an anonymous count circle.
 *
 *  ≤ 5 events  → one emoji PER EVENT, duplicates kept — two 🎫 events
 *                render 🎫🎫, so the chip itself says "two events here".
 *  > 5 events  → up to 5 DISTINCT emojis sampled from the cluster (the
 *                variety is the signal now; a count badge carries the
 *                number). The sample is seeded by the member ids so a
 *                pan/zoom doesn't reshuffle the picks — "random" per
 *                cluster, stable per composition. */
export const CLUSTER_EMOJI_MAX = 5;

export function clusterEmojis(
  events: Array<{ id: string; emoji: string }>,
  max = CLUSTER_EMOJI_MAX,
): string[] {
  if (events.length <= max) return events.map((e) => e.emoji);

  const distinct = [...new Set(events.map((e) => e.emoji))];
  if (distinct.length <= max) return distinct;

  // FNV-1a over the member ids → deterministic shuffle seed.
  let seed = 2166136261;
  for (const e of events) {
    for (let i = 0; i < e.id.length; i++) {
      seed = Math.imul(seed ^ e.id.charCodeAt(i), 16777619);
    }
  }
  const pool = [...distinct];
  const out: string[] = [];
  while (out.length < max && pool.length > 0) {
    seed = Math.imul(seed, 1597334677) + 12345;
    out.push(pool.splice((seed >>> 8) % pool.length, 1)[0]!);
  }
  return out;
}
