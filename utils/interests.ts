/** Fixed vocabulary of profile interests. Mirrors the CHECK in
 *  `20260716000000_profile_bio_interests.sql`. When you add a value
 *  here, also add it to the SQL check function, or the DB will reject
 *  the update. */
export type Interest = {
  key: string;
  label: string;
  emoji: string;
};

export const INTERESTS: readonly Interest[] = [
  { key: 'films',        label: 'Films',           emoji: '🎬' },
  { key: 'coffee',       label: 'Coffee',          emoji: '☕' },
  { key: 'running',      label: 'Running',         emoji: '🏃' },
  { key: 'books',        label: 'Books',           emoji: '📚' },
  { key: 'music',        label: 'Music',           emoji: '🎧' },
  { key: 'food',         label: 'Food',            emoji: '🍜' },
  { key: 'travel',       label: 'Travel',          emoji: '✈️' },
  { key: 'photography',  label: 'Photography',     emoji: '📷' },
  { key: 'art',          label: 'Art',             emoji: '🎨' },
  { key: 'games',        label: 'Games',           emoji: '🎮' },
  { key: 'fitness',      label: 'Fitness',         emoji: '💪' },
  { key: 'yoga',         label: 'Yoga',            emoji: '🧘' },
  { key: 'tech',         label: 'Tech',            emoji: '💻' },
  { key: 'outdoors',     label: 'Outdoors',        emoji: '🌲' },
  { key: 'nightlife',    label: 'Nightlife',       emoji: '🌃' },
  { key: 'spontaneous',  label: 'Spontaneous',     emoji: '⚡' },
] as const;

export const INTERESTS_BY_KEY: Record<string, Interest> = Object.fromEntries(
  INTERESTS.map((i) => [i.key, i]),
);

/** Enforce the DB cap (8) on the client too so users see the error
 *  before they hit save. */
export const MAX_INTERESTS = 8;
