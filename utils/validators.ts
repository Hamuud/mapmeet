import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const signUpSchema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.')
    .max(24, 'Username must be 24 characters or fewer.')
    .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, "_" and "." only.'),
  displayName: z
    .string()
    .min(1, 'Display name is required.')
    .max(40, 'Display name must be 40 characters or fewer.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email.'),
});

// Mirror of the SQL check constraint on events.tags — 2..24 chars, no
// whitespace. Any Unicode script is fine (Cyrillic, Chinese, emoji…);
// the client-side normalizer (`normalizeTag`) collapses spaces to
// dashes so multi-word input still commits as a single tag.
const TAG_REGEX = /^\S{2,24}$/;

export const eventSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(80),
  description: z.string().max(500).optional().or(z.literal('')),
  emoji: z.string().min(1, 'Pick an emoji.').max(8),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date.'),
  event_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time.'),
  max_participants: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
  visibility: z.enum(['public', 'private']).default('public'),
  tags: z
    .array(z.string().regex(TAG_REGEX, 'Use 2–24 letters, digits, `-` or `_`.'))
    .min(1, 'Add at least one tag.')
    .max(5, 'Up to 5 tags.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type EventInput = z.infer<typeof eventSchema>;
