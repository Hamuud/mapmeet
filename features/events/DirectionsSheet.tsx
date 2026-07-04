import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator | null;
  onClose: () => void;
};

type MapsApp = {
  key: string;
  name: string;
  tag: string;
  icon: string;
  buildUrl: (lat: number, lng: number, title: string) => string;
};

/** Universal https:// URLs work everywhere:
 *  - iOS routes them to the installed native app (Maps / Google Maps / Waze)
 *    or falls back to Safari
 *  - Android routes them to the app or the browser
 *  - Web opens the web experience in a new tab
 *  Nothing here needs LSApplicationQueriesSchemes or Android intents. */
const APPS: MapsApp[] = [
  {
    key: 'google',
    name: 'Google Maps',
    tag: 'Live traffic',
    icon: '🗺️',
    buildUrl: (lat, lng) =>
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${lat},${lng}`,
  },
  {
    key: 'apple',
    name: 'Apple Maps',
    tag: 'iOS + macOS',
    icon: '',
    buildUrl: (lat, lng, title) =>
      `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(title)}&dirflg=d`,
  },
  {
    key: 'waze',
    name: 'Waze',
    tag: 'Driver-first',
    icon: '🚗',
    buildUrl: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  },
];

async function openUrl(url: string) {
  if (Platform.OS === 'web') {
    // noopener + noreferrer prevents the new tab from reaching back into
    // window.opener, which is the standard hardening for target=_blank.
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

export function DirectionsSheet({ event, onClose }: Props) {
  const toast = useToast();
  const open = !!event;

  const handlePick = async (app: MapsApp) => {
    if (!event) return;
    try {
      await openUrl(app.buildUrl(event.latitude, event.longitude, event.title));
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : `Could not open ${app.name}`,
        'error',
      );
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.52}>
      {event ? (
        <View className="flex-1">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
              <Text style={{ fontSize: 26 }}>{event.emoji}</Text>
            </View>
            <View className="flex-1">
              <Text
                className="text-lg font-semibold text-text-light dark:text-text-dark"
                numberOfLines={1}
              >
                Directions to {event.title}
              </Text>
              <Text className="text-xs text-muted-light dark:text-muted-dark">
                Pick your navigation app
              </Text>
            </View>
          </View>

          <View className="mt-4 gap-2">
            {APPS.map((app) => (
              <Pressable
                key={app.key}
                onPress={() => handlePick(app)}
                className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-surface-light p-4 active:opacity-80 dark:border-border-dark dark:bg-elevated-dark"
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10">
                  <Text style={{ fontSize: 22 }}>{app.icon || '🧭'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-text-light dark:text-text-dark">
                    {app.name}
                  </Text>
                  <Text className="text-xs text-muted-light dark:text-muted-dark">
                    {app.tag}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color="#8E8E93" />
              </Pressable>
            ))}
          </View>

          <Text className="mt-4 text-[11px] text-muted-light dark:text-muted-dark">
            Opens the app if you have it installed, otherwise the web version.
            {'\n'}Destination: {event.latitude.toFixed(5)},{' '}
            {event.longitude.toFixed(5)}
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
