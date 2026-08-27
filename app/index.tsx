import { Redirect } from 'expo-router';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore } from '@/store/auth.store';

/** Entry point. Everyone lands on the map, signed in or not.
 *
 *  The map is the app's shop window: a visitor can pan it, see what is
 *  happening nearby and open an event's preview before deciding whether
 *  to make an account. The wall sits on the actions that need identity —
 *  joining, chatting, saving, hosting — not on the front door. */
export default function Index() {
  const status = useAuthStore((s) => s.status);

  // Still resolving a stored session. Redirecting now would send a
  // returning member to the guest map for a frame.
  if (status !== 'ready') {
    return <LoadingSpinner fullScreen />;
  }
  return <Redirect href="/(tabs)/map" />;
}
