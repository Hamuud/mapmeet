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
export async function registerForPush(userId: string): Promise<string | null> {
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
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
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
 *  Used when the master switch goes off — clearing the token is what
 *  actually stops delivery, since every send path filters on it. */
export async function clearPushToken(userId: string): Promise<void> {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}
