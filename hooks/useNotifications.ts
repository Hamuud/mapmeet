import { router } from 'expo-router';
import { useEffect } from 'react';

import { useLocation } from '@/hooks/useLocation';
import {
  addNotificationResponseListener,
  clearPushToken,
  configureNotificationHandler,
  registerForPush,
  syncPushSettings,
} from '@/services/push.service';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

/** Wires push notifications for the authed session:
 *   - configures the foreground presentation handler
 *   - registers the device's Expo push token to the profile (respecting
 *     the Push-notifications preference toggle)
 *   - mirrors the notification settings the server needs while the app
 *     is closed: language, timezone, category switches, digest anchor
 *   - deep-links to the relevant surface when a notification is tapped
 *
 *  Everything degrades to a no-op where push isn't available (web,
 *  simulator, pre-notifications native build) — see push.service. */
export function useNotifications() {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user.id ?? null;
  const pushEnabled = usePreferencesStore((s) => s.pushNotifications);
  const categories = usePreferencesStore((s) => s.push);
  const locale = usePreferencesStore((s) => s.locale);
  const radiusKm = usePreferencesStore((s) => s.searchRadiusKm);
  const { coords } = useLocation();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    // Turning the master switch off drops the token: that is what
    // actually stops delivery, since every send path filters on it. The
    // per-category switches ride on the profile row instead, because
    // they have to be readable by a cron job at 3am.
    if (pushEnabled) void registerForPush();
    else void clearPushToken().catch(() => {});
  }, [viewerId, pushEnabled]);

  useEffect(() => {
    if (!viewerId) return;
    // Fire-and-forget: a failed sync leaves the server on its previous
    // values, which is a stale preference rather than a broken screen.
    void syncPushSettings({ locale, categories, radiusKm, coords }).catch(() => {});
  }, [viewerId, locale, categories, radiusKm, coords]);

  useEffect(() => {
    const unsub = addNotificationResponseListener((data) => {
      const eventId = typeof data.eventId === 'string' ? data.eventId : null;
      const groupId = typeof data.groupId === 'string' ? data.groupId : null;
      const kind = typeof data.kind === 'string' ? data.kind : '';

      if (groupId) {
        router.navigate({ pathname: '/group/[id]', params: { id: groupId } });
        return;
      }
      if (eventId) {
        router.navigate({ pathname: '/chat/[id]', params: { id: eventId } });
        return;
      }
      if (kind === 'friend_request' || kind === 'friend_accepted') {
        router.navigate('/friends');
        return;
      }
      // The area digest has nothing specific to open — the map is the
      // whole point of it.
      if (kind === 'digest') router.navigate('/(tabs)/map');
    });
    return unsub;
  }, []);
}
