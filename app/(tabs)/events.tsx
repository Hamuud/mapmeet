import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { useAuth } from '@/hooks/useAuth';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import type { EventWithCreator } from '@/types';

type Tab = 'created' | 'joined';

export default function MyEventsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const events = useEventsStore((s) => s.events);
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const selectEvent = useEventsStore((s) => s.selectEvent);
  const [tab, setTab] = useState<Tab>('created');
  const [editEvent, setEditEvent] = useState<EventWithCreator | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventWithCreator | null>(null);

  const filtered = useMemo(() => {
    if (!profile) return [];
    // Defensive: filter out anything with a missing id — the FlatList
    // keyExtractor would blow up on undefined ids, which we saw
    // manifest as "blank screen after switching to Joined".
    const safe = events.filter((e): e is EventWithCreator => !!e && !!e.id);
    return tab === 'created'
      ? safe.filter((e) => e.creator_id === profile.id)
      : safe.filter((e) => e.is_joined === true);
  }, [events, profile, tab]);

  const openOnMap = (event: EventWithCreator) => {
    selectEvent(event.id);
    router.push('/(tabs)/map');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await eventsService.remove(target.id);
      removeEvent(target.id);
      toast.show('Event deleted.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not delete', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          My events
        </Text>
        <View className="mt-4 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
          <SegmentButton
            label="Created"
            active={tab === 'created'}
            onPress={() => setTab('created')}
          />
          <SegmentButton
            label="Joined"
            active={tab === 'joined'}
            onPress={() => setTab('joined')}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            emoji={tab === 'created' ? '📍' : '🙋'}
            title={tab === 'created' ? 'No events yet' : "You haven't joined any events"}
            description={
              tab === 'created'
                ? 'Drop your first pin from the map tab.'
                : 'Tap a marker on the map to join.'
            }
            actionLabel="Open map"
            onAction={() => router.push('/(tabs)/map')}
          />
        }
        renderItem={({ item }) => (
          <View className="gap-2">
            <EventCard event={item} onPress={() => openOnMap(item)} />
            {tab === 'created' ? (
              <View className="flex-row items-center gap-2 pl-3">
                <ActionChip
                  icon="location"
                  label="View on map"
                  onPress={() => openOnMap(item)}
                />
                <ActionChip
                  icon="create-outline"
                  label="Edit"
                  onPress={() => setEditEvent(item)}
                />
                <ActionChip
                  icon="trash-outline"
                  label="Delete"
                  tone="danger"
                  onPress={() => setPendingDelete(item)}
                />
              </View>
            ) : (
              <View className="flex-row items-center pl-3">
                <ActionChip
                  icon="location"
                  label="View on map"
                  onPress={() => openOnMap(item)}
                />
              </View>
            )}
          </View>
        )}
      />

      <EditEventSheet
        event={editEvent}
        open={!!editEvent}
        onClose={() => setEditEvent(null)}
      />

      <ConfirmationDialog
        open={!!pendingDelete}
        title="Delete event?"
        message="Attendees will lose their spot. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-1 items-center justify-center rounded-xl py-2',
        active
          ? 'bg-panel-light shadow-sm shadow-black/10 dark:bg-panel-dark'
          : '',
      ].join(' ')}
    >
      <Text
        className={[
          'text-sm font-semibold',
          active
            ? 'text-text-light dark:text-text-dark'
            : 'text-muted-light dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type ActionChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
};

function ActionChip({ icon, label, onPress, tone = 'default' }: ActionChipProps) {
  const isDanger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-row items-center gap-1 rounded-full px-3 py-1',
        isDanger
          ? 'bg-red-500/10'
          : 'bg-panel-light dark:bg-panel-dark border border-border-light dark:border-border-dark',
      ].join(' ')}
      hitSlop={4}
    >
      <Ionicons
        name={icon}
        size={12}
        color={isDanger ? '#EF4444' : '#4B5FE0'}
      />
      <Text
        className={[
          'text-[11px] font-semibold',
          isDanger ? 'text-red-500' : 'text-brand-500',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
