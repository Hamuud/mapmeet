import type { UserRole } from '@/types/database';

/** Moderation powers. The mirror of `is_admin()` in SQL, and the same
 *  warning applies: this is an explicit list, never `role !== 'user'`.
 *  'premium' is a paid cosmetic tier — treating it as "not a plain user"
 *  would hand the reports queue to every subscriber. */
const STAFF_ROLES: readonly UserRole[] = ['support', 'admin', 'owner'];

/** Entitled to a styled event pin: premium and everyone above it. Mirror
 *  of `can_style_pin()`. The server is the authority — the DB trigger
 *  drops styling from anyone this would have returned false for — but
 *  the client uses it twice: to decide whether to offer the wizard step,
 *  and to decide whether to *render* a stored style.
 *
 *  Rendering is checked against the creator's CURRENT role, so when
 *  premium lapses their pins quietly go back to standard on everyone's
 *  map while the stored choice waits for them to resubscribe. */
const PIN_STYLE_ROLES: readonly UserRole[] = [
  'premium',
  'support',
  'admin',
  'owner',
];

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function canStylePin(role: UserRole | null | undefined): boolean {
  return !!role && PIN_STYLE_ROLES.includes(role);
}

/** True for the paid tier specifically — staff are entitled to the same
 *  perks but should not be labelled as subscribers. */
export function isPremiumRole(role: UserRole | null | undefined): boolean {
  return role === 'premium';
}
