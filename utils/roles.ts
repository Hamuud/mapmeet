import type { UserRole } from '@/types/database';

/** Moderation powers. The mirror of `staff_roles()` in SQL, and the same
 *  warning applies: this is an explicit list, never `role !== 'user'`.
 *  'premium' is a paid cosmetic tier — treating it as "not a plain user"
 *  would hand the reports queue to every subscriber. 'designer' is in
 *  here because that role does carry admin access. */
const STAFF_ROLES: readonly UserRole[] = [
  'designer',
  'support',
  'admin',
  'owner',
];

/** Entitled to a styled event pin: the paid tier plus all staff. Mirror
 *  of `can_style_pin()`. The server is the authority — the DB trigger
 *  drops styling from anyone this would have returned false for — but
 *  the client uses it twice: to decide whether to offer the wizard step,
 *  and to decide whether to *render* a stored style.
 *
 *  Rendering is checked against the creator's CURRENT role, so when
 *  premium lapses their pins quietly go back to standard on everyone's
 *  map while the stored choice waits for them to resubscribe. */
const PIN_STYLE_ROLES: readonly UserRole[] = ['premium', ...STAFF_ROLES];

/** Allowed off the fixed palette — any #RRGGBB, and their own emoji as
 *  the falling particles. Mirror of `can_style_pin_freeform()`.
 *
 *  The designer tier is the point of it. The owner is included because
 *  they administer the app and cannot hold a second role alongside
 *  'owner' — role is a single column, not a set of flags. */
const FREEFORM_STYLE_ROLES: readonly UserRole[] = ['designer', 'owner'];

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function canStylePin(role: UserRole | null | undefined): boolean {
  return !!role && PIN_STYLE_ROLES.includes(role);
}

export function canStylePinFreeform(role: UserRole | null | undefined): boolean {
  return !!role && FREEFORM_STYLE_ROLES.includes(role);
}

/** True for the paid tier specifically — staff are entitled to the same
 *  perks but should not be labelled as subscribers. */
export function isPremiumRole(role: UserRole | null | undefined): boolean {
  return role === 'premium';
}
