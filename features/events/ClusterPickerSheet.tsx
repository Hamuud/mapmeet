import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator } from '@/types';

type Props = {
  events: EventWithCreator[] | null;
  onClose: () => void;
  onPick: (eventId: string) => void;
};

/** Sheet that pops up when the viewer taps a cluster. Lists every event
 *  that sits under that cluster so co-located pins can be resolved
 *  without waiting for zoom to separate them (which never works when
 *  events share the exact same coordinate). */
export function ClusterPickerSheet({ events, onClose, onPick }: Props) {
  const open = !!events && events.length > 0;
  const heightPct = events && events.length > 4 ? 0.7 : 0.5;
  return (
    <BottomSheet open={open} onClose={onClose} heightPct={heightPct}>
      {events ? (
        <View className="flex-1">
          <Text className="text-xl font-semibold text-text-light dark:text-text-dark">
            {events.length} events here
          </Text>
          <Text className="mt-1 text-xs text-muted-light dark:text-muted-dark">
            Pick one to see details.
          </Text>

          <FlatList
            data={events}
            keyExtractor={(e) => e.id}
            className="mt-3"
            contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item.id)}
                className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-surface-light p-3 active:opacity-80 dark:border-border-dark dark:bg-elevated-dark"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
                  <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="flex-1 text-sm font-semibold text-text-light dark:text-text-dark"
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {item.visibility === 'private' ? (
                      <Badge
                        label="Private"
                        tone="private"
                        icon={
                          <Ionicons name="lock-closed" size={10} color="#B45309" />
                        }
                      />
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">
                    {formatEventDate(item.event_date)} ·{' '}
                    {formatEventTime(item.event_time)} · {item.participant_count} going
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}
