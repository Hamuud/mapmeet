import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator;
  onPress: () => void;
};

/** Pinned event snapshot under the chat header — emoji, title, date,
 *  attendee count. The live event row IS the snapshot (no denormalized
 *  copy to go stale). Tap to expand full event details. */
export function PinnedEventBanner({ event, onPress }: Props) {
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
      </View>
      <Ionicons name="chevron-down" size={14} color="#8B8880" />
    </Pressable>
  );
}
