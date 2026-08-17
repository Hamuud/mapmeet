import { Redirect, Stack, useSegments } from 'expo-router';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore } from '@/store/auth.store';

/** Screens in this group that a signed-in user is *supposed* to be on.
 *
 *  Both are one-time gates the tab layout redirects into — finish your
 *  handle, and say how old you are. Without this exemption the two
 *  layouts fight: the tabs send a signed-in user here, and the line
 *  below sends them straight back, forever. (That loop was already
 *  latent for `welcome`; it only stayed hidden because no account has
 *  had `onboarding_complete = false` while Google sign-in is off.) */
const GATES = ['welcome', 'age'];

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const segments = useSegments();
  const onGate = GATES.includes(String(segments[segments.length - 1]));

  if (status !== 'ready') return <LoadingSpinner fullScreen />;
  if (session && !onGate) return <Redirect href="/(tabs)/map" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    />
  );
}
