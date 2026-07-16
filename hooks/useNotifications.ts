import { router } from 'expo-router';
import { useEffect } from 'react';

import {
  addNotificationResponseListener,
  configureNotificationHandler,
  registerForPush,
} from '@/services/push.service';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

/** Wires push notifications for the authed session:
 *   - configures the foreground presentation handler
 *   - registers the device's Expo push token to the profile (respecting
 *     the Push-notifications preference toggle)
 *   - deep-links to the relevant chat when a notification is tapped
 *
 *  Everything degrades to a no-op where push isn't available (web,
 *  simulator, pre-notifications native build) — see push.service. */
export function useNotifications() {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user.id ?? null;
  const pushEnabled = usePreferencesStore((s) => s.pushNotifications);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (!viewerId || !pushEnabled) return;
    void registerForPush(viewerId);
  }, [viewerId, pushEnabled]);

  useEffect(() => {
    const unsub = addNotificationResponseListener((data) => {
      const eventId = typeof data.eventId === 'string' ? data.eventId : null;
      if (eventId) {
        router.push({ pathname: '/chat/[id]', params: { id: eventId } });
      }
    });
    return unsub;
  }, []);
}
