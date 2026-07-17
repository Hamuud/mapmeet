/** Taxi-style user rating.
 *
 *  Every account starts at a flat 5.0 by being "seeded" with 200
 *  positive reviews, so early dislikes dent the score gently instead
 *  of tanking it:
 *
 *      rating = 5 * (200 + likes) / (200 + likes + dislikes)
 *
 *  One dislike on a fresh account → 4.98, ten → 4.76. Must stay in
 *  sync with the comment in migration 20260720010000. */
export const RATING_SEED_POSITIVE = 200;

export function computeRating(likes: number, dislikes: number): number {
  const positive = RATING_SEED_POSITIVE + Math.max(0, likes);
  const total = positive + Math.max(0, dislikes);
  return (5 * positive) / total;
}

/** "4.98"-style display string, two decimals like ride-hail apps. */
export function formatRating(likes: number, dislikes: number): string {
  return computeRating(likes, dislikes).toFixed(2);
}
