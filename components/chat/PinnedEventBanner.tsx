import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { geocodingService } from '@/services/geocoding.service';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator;
  onPress: () => void;
};

/** Session cache for reverse-geocoded venue labels — Nominatim allows
 *  ~1 req/s, so never ask twice for the same event. */
const venueCache = new Map<string, string | null>();

/** Resolve a human-readable venue for the banner. Prefers the stored
 *  `address` (what the host picked in the search); falls back to a
 *  one-shot reverse geocode for events created before the column
 *  existed. */
function useVenue(event: EventWithCreator): string | null {
  const [venue, setVenue] = useState<string | null>(
    event.address ?? venueCache.get(event.id) ?? null,
  );

  useEffect(() => {
    if (event.address) {
      setVenue(event.address);
      return;
    }
    if (venueCache.has(event.id)) {
      setVenue(venueCache.get(event.id) ?? null);
      return;
    }
    let cancelled = false;
    geocodingService
      .reverse({ latitude: event.latitude, longitude: event.longitude })
      .then((label) => {
        venueCache.set(event.id, label);
        if (!cancelled) setVenue(label);
      })
      .catch(() => {
        venueCache.set(event.id, null);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id, event.address, event.latitude, event.longitude]);

  return venue;
}

/** Pinned event snapshot under the chat header — emoji, title, date,
 *  attendee count, and the venue line. The live event row IS the
 *  snapshot (no denormalized copy to go stale). Tap to expand full
 *  event details. */
export function PinnedEventBanner({ event, onPress }: Props) {
  const venue = useVenue(event);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border-light bg-elevated-light px-4 py-2.5 active:opacity-80 dark:border-border-dark dark:bg-elevated-dark"
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-panel-light dark:bg-panel-dark">
        <Text style={{ fontSize: 18 }}>{event.emoji}</Text>
      </View>
      <View className="flex-1">
        <Text
          className="text-sm font-semibold text-text-light dark:text-text-dark"
          numberOfLines={1}
        >
          {event.title}
        </Text>
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
          {formatEventDate(event.event_date)} · {formatEventTime(event.event_time)} ·{' '}
          {event.participant_count} going
          {event.max_participants ? ` / ${event.max_participants}` : ''}
        </Text>
        {venue ? (
          <View className="mt-0.5 flex-row items-center gap-1">
            <Ionicons name="location" size={10} color="#4B5FE0" />
            <Text
              className="flex-1 text-[11px] font-medium text-brand-500"
              numberOfLines={1}
            >
              {venue}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-down" size={14} color="#8B8880" />
    </Pressable>
  );
}
