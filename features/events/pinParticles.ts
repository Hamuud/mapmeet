/** Layout for the falling particles, shared by both renderers.
 *
 *  Two properties matter and they pull against each other:
 *
 *  - Random. Three particles at fixed offsets with fixed 0.5s stagger
 *    read as one machine firing left to right, every pin identical.
 *    Scattering the column, the phase, the speed and a little sideways
 *    drift turns the same three elements into weather.
 *
 *  - Stable. "Random" must not mean "different every render" — the whole
 *    bug this fixes was animations restarting. The scatter is derived
 *    from the event id, so a pin looks the same on every reload and on
 *    every device, and no two pins share a pattern.
 */

/** FNV-1a. Small, dependency-free, and good enough to decorrelate two
 *  uuids that differ in one character. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG. */
function prng(state: number): () => number {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ParticleLayout = {
  /** Horizontal start, in px from the left edge of the pin. */
  left: number;
  /** Seconds before this particle first falls. Applied once, not once
   *  per lap — a delay inside the loop would insert a pause every
   *  cycle and the stream would stutter instead of flow. */
  delay: number;
  /** Seconds for one fall. */
  duration: number;
  /** Sideways travel over the fall, px. Signed. */
  drift: number;
};

/** Width the layout is computed against. Deliberately the unselected pin
 *  size: a selected pin grows by 4px, and recomputing the columns would
 *  make the particles jump sideways the moment you tap it. Two pixels of
 *  asymmetry is invisible; a jump is not. */
export const PARTICLE_BASE_SIZE = 44;

export const PARTICLE_COUNT = 3;

export function particleLayout(seed: string): ParticleLayout[] {
  const rand = prng(hash(seed));
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    left: 2 + rand() * (PARTICLE_BASE_SIZE - 12),
    delay: rand() * 1.8,
    duration: 1.3 + rand() * 0.9,
    drift: Math.round((rand() * 2 - 1) * 9),
  }));
}
