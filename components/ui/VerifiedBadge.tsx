import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useT } from '@/i18n';
import type { UserRole } from '@/types/database';
import { isPremiumRole, isStaffRole } from '@/utils/roles';

/** Instagram-style verification blue. */
const VERIFIED_BLUE = '#1D9BF0';
/** Premium gold. Distinct from the blue check on purpose — a subscriber
 *  is not a moderator, and the two must never be mistaken for each
 *  other. */
const PREMIUM_GOLD = '#D98C00';

/** Roles that earn the blue check: staff only.
 *
 *  This used to be `role !== 'user'`, which quietly handed the badge to
 *  every premium subscriber the moment that role existed. Staff
 *  membership is now explicit — see utils/roles.ts. */
export function isVerifiedRole(role: UserRole | null | undefined): boolean {
  return isStaffRole(role);
}

type Props = {
  role: UserRole | null | undefined;
  /** Glyph size in px; the disc scales with it. */
  size?: number;
};

/** Badge shown beside a name: a blue check for staff (support / admin /
 *  owner), a gold star for premium, nothing for everyone else — so
 *  callers can keep dropping it in unconditionally next to any name. */
export function VerifiedBadge({ role, size = 14 }: Props) {
  const t = useT();
  const staff = isStaffRole(role);
  const premium = isPremiumRole(role);
  if (!staff && !premium) return null;
  return (
    <View
      accessibilityLabel={
        staff ? t('a11y.verifiedAccount') : t('a11y.premiumAccount')
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: staff ? VERIFIED_BLUE : PREMIUM_GOLD,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={staff ? 'checkmark' : 'star'}
        size={Math.round(size * (staff ? 0.68 : 0.6))}
        color="#fff"
      />
    </View>
  );
}
