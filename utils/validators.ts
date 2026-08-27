import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(8, 'validation.passwordMin'),
});

/** The youngest MapMeet accepts. Mirror of `min_signup_age()` in
 *  20260820000000_age_signal.sql — this copy exists so the form can say
 *  no before a round trip, but the SQL one is what actually decides. */
export const MIN_SIGNUP_AGE = 16;

/** Whole years between a 'YYYY-MM-DD' date and today, or null if the
 *  string isn't a date. Counts the birthday itself, so someone turning
 *  16 today is 16. */
export function ageFrom(dob: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(y, mo - 1, d);
  if (
    born.getFullYear() !== y ||
    born.getMonth() !== mo - 1 ||
    born.getDate() !== d
  ) {
    return null; // 31 February and friends
  }
  if (born.getTime() > now.getTime()) return null;
  let age = now.getFullYear() - y;
  const hadBirthday =
    now.getMonth() > mo - 1 ||
    (now.getMonth() === mo - 1 && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export const dateOfBirthSchema = z
  .string()
  .min(1, 'validation.dobRequired')
  .refine((v) => ageFrom(v) !== null, 'validation.dobInvalid')
  .refine((v) => (ageFrom(v) ?? 0) >= MIN_SIGNUP_AGE, 'validation.tooYoung')
  .refine((v) => (ageFrom(v) ?? 0) <= 120, 'validation.dobInvalid');

export const signUpSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(8, 'validation.passwordMin'),
  dateOfBirth: dateOfBirthSchema,
  username: z
    .string()
    .min(3, 'validation.usernameMin')
    .max(24, 'validation.usernameMax')
    .regex(/^[a-zA-Z0-9_.]+$/, 'validation.usernameChars'),
  displayName: z
    .string()
    .min(1, 'validation.displayNameRequired')
    .max(40, 'validation.displayNameMax'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('validation.email'),
});

// Mirror of the SQL check constraint on events.tags — 2..24 chars, no
// whitespace. Any Unicode script is fine (Cyrillic, Chinese, emoji…);
// the client-side normalizer (`normalizeTag`) collapses spaces to
// dashes so multi-word input still commits as a single tag.
const TAG_REGEX = /^\S{2,24}$/;

/** How often an event repeats. 'none' rather than null so the wizard's
 *  segmented control always has a selected option. */
export const REPEAT_OPTIONS = ['none', 'weekly', 'fortnightly', 'monthly'] as const;
export type RepeatOption = (typeof REPEAT_OPTIONS)[number];

export const eventSchema = z.object({
  title: z.string().min(1, 'validation.titleRequired').max(80),
  description: z.string().max(500).optional().or(z.literal('')),
  // Cap matches the DB CHECK `char_length(emoji) between 1 and 8`,
  // which counts Unicode code points. Flag emojis (🏳️‍🌈 = 4) and
  // families (👨‍👩‍👧‍👦 = 7) both fit — the previous 8-UTF-16-unit
  // conflation was cutting complex ZWJ sequences.
  emoji: z.string().min(1, 'validation.emojiRequired').refine(
    (v) => Array.from(v).length <= 8,
    'validation.emojiTooLong',
  ),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Venue label from the address search — display-only, coords stay
  // the source of truth for the pin.
  address: z.string().max(200).optional().nullable(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidDate'),
  event_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'validation.invalidTime'),
  max_participants: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
  visibility: z.enum(['public', 'private']).default('public'),
  // Premium pin styling. Optional for everyone — the wizard only offers
  // the step to entitled accounts, and the DB trigger drops the values
  // if they arrive from anyone else, so the schema stays permissive and
  // the entitlement lives in exactly one place.
  // Palette key or a designer's raw #RRGGBB — the same two shapes the
  // SQL CHECK allows. Which one an account may actually store is the
  // trigger's business, not the schema's.
  pin_color: z
    .union([
      z.enum(['rose', 'amber', 'lime', 'teal', 'sky', 'indigo', 'violet', 'magenta']),
      z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'validation.hexColor'),
    ])
    .nullable()
    .default(null),
  pin_effect: z
    .enum(['none', 'glow', 'stars', 'shine'])
    .nullable()
    .default('none'),
  pin_effect_emoji: z
    .array(z.string().min(1).max(16))
    .max(3)
    .nullable()
    .default(null),
  tags: z
    .array(z.string().regex(TAG_REGEX, 'validation.tagFormat'))
    .min(1, 'validation.tagMin')
    .max(5, 'validation.tagMax'),
  /** Premium only, and not a column: the event is created first and
   *  `set_event_repeat` turns it into a series afterwards. The server
   *  re-checks the entitlement, so a crafted request gains nothing. */
  repeat: z.enum(REPEAT_OPTIONS).default('none'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type EventInput = z.infer<typeof eventSchema>;
