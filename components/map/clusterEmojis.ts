/** Which emojis a map cluster shows.
 *
 *  ALWAYS DISTINCT. If several events in the cluster share an emoji,
 *  that emoji occupies one slot and the remaining slots are filled from
 *  the OTHER events in the cluster — never from a duplicate. So a
 *  cluster of {🎤,🎤,🍰,🍰,⚽} orbits three glyphs, not five; and if
 *  the cluster is a single dominant emoji ({🎤,🎤,🎤}) the marker
 *  shows just 🎤 (with the count badge carrying the real total).
 *
 *  Distinct count > 5 → we can't fit them all, so five are sampled
 *  deterministically (seeded by the member ids) — same composition,
 *  same picks, so panning/zooming doesn't reshuffle the marker. */
export const CLUSTER_EMOJI_MAX = 5;

export function clusterEmojis(
  events: Array<{ id: string; emoji: string }>,
  max = CLUSTER_EMOJI_MAX,
): string[] {
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
