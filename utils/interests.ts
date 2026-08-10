import type { TranslationKey } from '@/i18n';

/** Fixed vocabulary of profile interests. Mirrors the CHECK in
 *  `20260716000000_profile_bio_interests.sql`. When you add a value
 *  here, also add it to the SQL check function, or the DB will reject
 *  the update. */
export type Interest = {
  key: string;
  /** Dictionary key — resolve with `t()` at render time. The stored
   *  value is always `key`, so switching language never rewrites data. */
  labelKey: TranslationKey;
  emoji: string;
};

export const INTERESTS: readonly Interest[] = [
  { key: 'films', labelKey: 'interests.films', emoji: '🎬' },
  { key: 'coffee', labelKey: 'interests.coffee', emoji: '☕' },
  { key: 'running', labelKey: 'interests.running', emoji: '🏃' },
  { key: 'books', labelKey: 'interests.books', emoji: '📚' },
  { key: 'music', labelKey: 'interests.music', emoji: '🎧' },
  { key: 'food', labelKey: 'interests.food', emoji: '🍜' },
  { key: 'travel', labelKey: 'interests.travel', emoji: '✈️' },
  { key: 'photography', labelKey: 'interests.photography', emoji: '📷' },
  { key: 'art', labelKey: 'interests.art', emoji: '🎨' },
  { key: 'games', labelKey: 'interests.games', emoji: '🎮' },
  { key: 'fitness', labelKey: 'interests.fitness', emoji: '💪' },
  { key: 'yoga', labelKey: 'interests.yoga', emoji: '🧘' },
  { key: 'tech', labelKey: 'interests.tech', emoji: '💻' },
  { key: 'outdoors', labelKey: 'interests.outdoors', emoji: '🌲' },
  { key: 'nightlife', labelKey: 'interests.nightlife', emoji: '🌃' },
  { key: 'spontaneous', labelKey: 'interests.spontaneous', emoji: '⚡' },
] as const;

export const INTERESTS_BY_KEY: Record<string, Interest> = Object.fromEntries(
  INTERESTS.map((i) => [i.key, i]),
);

/** Enforce the DB cap (8) on the client too so users see the error
 *  before they hit save. */
export const MAX_INTERESTS = 8;
