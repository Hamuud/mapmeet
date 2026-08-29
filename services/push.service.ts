import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** EAS project id — required by getExpoPushTokenAsync so the token is
 *  scoped to this app. Read from app config so it can't drift. */
const PROJECT_ID =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId ?? '90246480-e1e3-4baa-b2e1-c4380f49f6f5';

// expo-notifications / expo-device are loaded lazily: the shipped iOS
// dev client predates these deps, and remote push doesn't exist on
// simulators/web at all. A static import would crash bundle eval on the
// old build; the lazy require means everything else keeps working and
// push simply no-ops until the next native build on a real device.
type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');

/** Whether the expo-notifications native side is actually present in
 *  this build. `requireOptionalNativeModule` returns null instead of
 *  throwing when the module is missing — so we can check without
 *  triggering the loud "Cannot find native module" error the current
 *  (pre-notifications) dev client would otherwise raise. */
function pushNativeAvailable(): boolean {
  try {
    return !!requireOptionalNativeModule('ExpoPushTokenManager');
  } catch {
    return false;
  }
}

function loadModules(): { Notifications: NotificationsModule; Device: DeviceModule } | null {
  if (!pushNativeAvailable()) return null;
  try {
    return {
      Notifications: require('expo-notifications') as NotificationsModule,
      Device: require('expo-device') as DeviceModule,
    };
  } catch {
    return null;
  }
}

let handlerConfigured = false;

/** Foreground presentation: show the banner + play sound even while the
 *  app is open, so an in-app message still surfaces. Safe to call more
 *  than once; only the first wins. */
export function configureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  const mods = loadModules();
  if (!mods) return;
  handlerConfigured = true;
  mods.Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Ask for permission, mint an Expo push token, and store it on the
 *  user's profile so the notify Edge Function can target them. Returns
 *  the token, or null when push isn't available (web, simulator, old
 *  build, or permission denied). */
// No userId parameter any more: the RPC takes the caller from the JWT.
// Passing one in would suggest a device could be registered against an
// account other than the one signed in, which is the whole bug.
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const mods = loadModules();
  if (!mods) return null;
  const { Notifications, Device } = mods;

  // Remote push needs a physical device — simulators can't register.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    });
    // Through the RPC, not a direct update on our own row. The token
    // names this handset, so claiming it has to release it from whoever
    // held it before — which is a write to somebody else's profile, and
    // only a SECURITY DEFINER function can do that. A plain update left
    // the previous account still holding it, and every message sent to
    // that account went on arriving here.
    const { error } = await supabase.rpc('set_push_token', { p_token: token });
    if (error) return null;
    return token;
  } catch {
    return null;
  }
}

/** Subscribe to notification taps. Returns an unsubscribe fn. The
 *  callback receives the `data` payload the Edge Function attached
 *  (e.g. `{ eventId }`) so the app can deep-link to the chat. */
export function addNotificationResponseListener(
  onTap: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};
  const mods = loadModules();
  if (!mods) return () => {};
  const sub = mods.Notifications.addNotificationResponseReceivedListener((response) => {
    onTap(response.notification.request.content.data ?? {});
  });
  return () => sub.remove();
}

/** Mirror the client's notification settings onto the profile row.
 *
 *  Everything here is decided while the app is closed — a cron job
 *  cannot read AsyncStorage — so the server needs its own copy of the
 *  language to write in, the timezone so it doesn't ping at 04:00, the
 *  category switches, and an anchor for what "your area" means.
 *
 *  Fire-and-forget by design: a failed sync leaves the server on its
 *  previous (or default) values, which is a slightly stale preference,
 *  not a broken screen.
 *
 *  `coords` is the user's last known position. It is only sent when the
 *  app actually has location — never guessed — so someone who has never
 *  granted permission simply gets no area digest. */
export async function syncPushSettings(input: {
  locale: string;
  categories: Record<'chat' | 'joins' | 'events' | 'social' | 'digest', boolean>;
  radiusKm: number;
  coords?: { latitude: number; longitude: number } | null;
}): Promise<void> {
  const { error } = await supabase.rpc('sync_push_settings', {
    p_locale: input.locale,
    // getTimezoneOffset counts the other way round: UTC+3 is -180.
    p_tz_offset: -new Date().getTimezoneOffset(),
    p_chat: input.categories.chat,
    p_joins: input.categories.joins,
    p_events: input.categories.events,
    p_social: input.categories.social,
    p_digest: input.categories.digest,
    p_lat: input.coords?.latitude ?? null,
    p_lng: input.coords?.longitude ?? null,
    p_radius_km: Math.round(input.radiusKm),
  });
  if (error) throw error;
}

/** Drop the stored token so the server stops targeting this device.
 *
 *  Two callers, and the second is the important one. The master push
 *  switch going off is the obvious case. Signing out is the case that
 *  was missing: leaving the token behind is what let a phone keep
 *  receiving an account's messages long after that account had left it.
 *
 *  Must be awaited BEFORE the sign-out completes — it is a write, and
 *  the JWT it needs dies with the session. */
export async function clearPushToken(): Promise<void> {
  await supabase.rpc('set_push_token', { p_token: null });
}
