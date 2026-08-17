import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { distanceKm, formatDistance } from '@/utils/distance';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, LatLng } from '@/types';
import { ambiguousTitles } from './matchEvents';

type Props = {
  events: EventWithCreator[];
  viewerLocation?: LatLng | null;
  onPick: (event: EventWithCreator) => void;
};

/** Events matching what's being typed, offered under the search box.
 *
 *  The map already filters its pins by the same query, but a pin is not
 *  an answer when the thing you are looking for is off screen or under a
 *  cluster. This says "here are the six things called that" and takes
 *  you to whichever one you meant. */
export function EventSuggestions({ events, viewerLocation, onPick }: Props) {
  const t = useT();
  if (events.length === 0) return null;
  const ambiguous = ambiguousTitles(events);

  return (
    <View className="mt-2 overflow-hidden rounded-xl border border-border-light bg-panel-light shadow-md shadow-black/10 dark:border-border-dark dark:bg-panel-dark">
      <Text className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-light">
        {t('search.events')}
      </Text>
      <ScrollView style={{ maxHeight: 268 }} keyboardShouldPersistTaps="handled">
        {events.map((event, i) => {
          const km = viewerLocation
            ? distanceKm(viewerLocation, {
                latitude: event.latitude,
                longitude: event.longitude,
              })
            : null;
          // Only when the name alone can't tell two of these apart.
          const venue = ambiguous.has(event.title.trim().toLowerCase())
            ? event.address?.trim()
            : null;

          return (
            <Pressable
              key={event.id}
              onPress={() => onPick(event)}
              className={[
                'flex-row items-center gap-2.5 px-3 py-2.5 active:opacity-70',
                i > 0 ? 'border-t border-border-light dark:border-border-dark' : '',
              ].join(' ')}
            >
              <Text style={{ fontSize: 18 }}>{event.emoji}</Text>
              <View className="flex-1">
                <Text
                  className="text-[13px] font-semibold text-text-light dark:text-text-dark"
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
                <Text
                  className="text-[11px] text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  {formatEventDate(event.event_date)} ·{' '}
                  {formatEventTime(event.event_time)}
                  {km != null ? ` · ${formatDistance(km)}` : ''}
                  {venue ? ` · ${venue}` : ''}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={12} color="#8B8880" />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
