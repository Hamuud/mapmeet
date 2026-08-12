import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(8, 'validation.passwordMin'),
});

export const signUpSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(8, 'validation.passwordMin'),
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
  pin_color: z
    .enum(['rose', 'amber', 'lime', 'teal', 'sky', 'indigo', 'violet', 'magenta'])
    .nullable()
    .default(null),
  pin_effect: z
    .enum(['none', 'glow', 'stars', 'shine'])
    .nullable()
    .default('none'),
  tags: z
    .array(z.string().regex(TAG_REGEX, 'validation.tagFormat'))
    .min(1, 'validation.tagMin')
    .max(5, 'validation.tagMax'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type EventInput = z.infer<typeof eventSchema>;
