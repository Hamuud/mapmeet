import { useEffect } from 'react';
import { AppState } from 'react-native';

import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';

/** Heartbeat that keeps `profiles.last_seen_at` fresh for the signed-in
 *  user, so DM partners can see "Online / last seen …". Fires on mount,
 *  every 45s while foregrounded, and again whenever the app returns to
 *  the foreground. Mounted once in the tabs layout. */
export function usePresence() {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user.id ?? null;

  useEffect(() => {
    if (!viewerId) return;
    const beat = () => void profilesService.touchLastSeen().catch(() => {});

    beat();
    const interval = setInterval(beat, 45_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [viewerId]);
}
