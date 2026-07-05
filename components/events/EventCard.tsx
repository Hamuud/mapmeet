import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator;
  distanceLabel?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

export function EventCard({ event, distanceLabel, onPress, trailing }: Props) {
  // Defensive reads — a joined feed can contain rows whose creator was
  // deleted (join left a null), or a legacy row whose tags column was
  // added after the fact. Guard both so the render can never throw.
  const creator = event.creator ?? {
    id: event.creator_id,
    username: 'unknown',
    display_name: 'Unknown',
    avatar_url: null,
  };
  const tags = Array.isArray(event.tags) ? event.tags : [];

  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-row items-center gap-3 rounded-3xl border p-4',
        'border-border-light bg-panel-light',
        'dark:border-border-dark dark:bg-panel-dark',
        'active:opacity-80',
      ].join(' ')}
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
        <Text style={{ fontSize: 28 }}>{event.emoji}</Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-base font-semibold text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {event.title}
          </Text>
          {event.visibility === 'private' ? (
            <Badge
              label="Private"
              tone="private"
              icon={<Ionicons name="lock-closed" size={10} color="#B45309" />}
            />
          ) : null}
        </View>
        <View className="mt-1 flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={12} color="#8B8880" />
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {formatEventDate(event.event_date)} · {formatEventTime(event.event_time)}
          </Text>
        </View>
        <View className="mt-1.5 flex-row items-center gap-2">
          <Avatar
            name={creator.display_name}
            uri={creator.avatar_url}
            size="xs"
          />
          <Text className="text-xs text-muted-light dark:text-muted-dark" numberOfLines={1}>
            {creator.display_name} · {event.participant_count} going
            {distanceLabel ? ` · ${distanceLabel}` : ''}
          </Text>
        </View>
        {tags.length > 0 ? (
          <View className="mt-2 flex-row flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <View
                key={tag}
                className="rounded-full bg-brand-500/10 px-2 py-0.5"
              >
                <Text className="text-[10px] font-semibold text-brand-500">
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Trailing tap target — the whole card opens on the map, but a
          dedicated arrow-in-circle makes the affordance unmistakable. */}
      {trailing ?? (
        <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-500/10">
          <Ionicons name="navigate" size={14} color="#4B5FE0" />
        </View>
      )}
    </Pressable>
  );
}
