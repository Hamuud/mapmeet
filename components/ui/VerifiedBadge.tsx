import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useT } from '@/i18n';
import type { Profile } from '@/types';

/** Instagram-style verification blue. */
const VERIFIED_BLUE = '#1D9BF0';

/** Roles that earn the badge — anyone holding a staff role. */
export function isVerifiedRole(role: Profile['role'] | null | undefined): boolean {
  return !!role && role !== 'user';
}

type Props = {
  role: Profile['role'] | null | undefined;
  /** Glyph size in px; the disc scales with it. */
  size?: number;
};

/** Blue check shown beside the names of staff (support / admin / owner).
 *  Renders nothing for regular accounts, so callers can drop it in
 *  unconditionally next to any name. */
export function VerifiedBadge({ role, size = 14 }: Props) {
  const t = useT();
  if (!isVerifiedRole(role)) return null;
  return (
    <View
      accessibilityLabel={t('a11y.verifiedAccount')}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: VERIFIED_BLUE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="checkmark" size={Math.round(size * 0.68)} color="#fff" />
    </View>
  );
}
