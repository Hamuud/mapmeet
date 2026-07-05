import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/components/ui/Toast';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { distanceKm, formatDistance } from '@/utils/distance';
import type { EventWithCreator } from '@/types';

type Tab = 'created' | 'joined' | 'nearby';

const RADII_KM = [1, 5, 10, 25, 50] as const;
type Radius = (typeof RADII_KM)[number];

function openMapWithEvent(id: string) {
  useEventsStore.getState().focusEvent(id);
  router.push('/(tabs)/map');
}

function goToMap() {
  router.push('/(tabs)/map');
}

export default function MyEventsScreen() {
  return (
    <ErrorBoundary where="My Events">
      <MyEventsBody />
    </ErrorBoundary>
  );
}

function MyEventsBody() {
  const toast = useToast();
  const { profile } = useAuth();
  const { coords, status: locStatus, request: requestLocation } = useLocation();
  const events = useEventsStore((s) => s.events);
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const [tab, setTab] = useState<Tab>('created');
  const [radius, setRadius] = useState<Radius>(5);
  const [editEvent, setEditEvent] = useState<EventWithCreator | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventWithCreator | null>(null);

  /** For nearby: pair every event with its distance so we can sort +
   *  filter + render distance labels off the same pass. */
  const nearby = useMemo(() => {
    if (!coords) return [];
    return events
      .filter((e): e is EventWithCreator => !!e && !!e.id)
      .map((event) => ({
        event,
        km: distanceKm(coords, {
          latitude: event.latitude,
          longitude: event.longitude,
        }),
      }))
      .filter(({ km }) => km <= radius)
      .sort((a, b) => a.km - b.km);
  }, [events, coords, radius]);

  const created = useMemo(() => {
    if (!profile) return [];
    return events
      .filter((e): e is EventWithCreator => !!e && !!e.id)
      .filter((e) => e.creator_id === profile.id);
  }, [events, profile]);

  const joined = useMemo(() => {
    return events
      .filter((e): e is EventWithCreator => !!e && !!e.id)
      .filter((e) => e.is_joined === true);
  }, [events]);

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
      {/* Header + segmented tabs */}
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          My events
        </Text>
        <View className="mt-4 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
          <SegmentButton
            label="Created"
            count={created.length}
            active={tab === 'created'}
            onPress={() => setTab('created')}
          />
          <SegmentButton
            label="Joined"
            count={joined.length}
            active={tab === 'joined'}
            onPress={() => setTab('joined')}
          />
          <SegmentButton
            label="Nearby"
            count={coords ? nearby.length : null}
            active={tab === 'nearby'}
            onPress={() => setTab('nearby')}
          />
        </View>
      </View>

      {/* Nearby subheader — radius chips + status. */}
      {tab === 'nearby' ? (
        <View className="px-5 pb-2 pt-1">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              Radius
            </Text>
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {coords
                ? `${nearby.length} within ${radius} km`
                : locStatus === 'requesting'
                  ? 'Locating…'
                  : 'No location'}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 8 }}
          >
            {RADII_KM.map((r) => {
              const active = r === radius;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRadius(r)}
                  className={[
                    'h-8 flex-row items-center rounded-full px-3',
                    active
                      ? 'bg-text-light dark:bg-text-dark'
                      : 'border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                  ].join(' ')}
                >
                  {active ? (
                    <View className="mr-1.5 h-1 w-1 rounded-full bg-surface-light dark:bg-surface-dark opacity-70" />
                  ) : null}
                  <Text
                    className={[
                      'text-xs font-semibold',
                      active
                        ? 'text-surface-light dark:text-surface-dark'
                        : 'text-text-light/85 dark:text-text-dark/85',
                    ].join(' ')}
                  >
                    {r} km
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* List */}
      {tab === 'nearby' ? (
        <FlatList
          data={nearby}
          keyExtractor={({ event }) => event.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            !coords ? (
              <EmptyState
                emoji="📍"
                title="Enable location to find events nearby"
                description={
                  locStatus === 'denied'
                    ? 'Location is off. Turn it on in Settings, then try again.'
                    : 'We need your location to compute distances.'
                }
                actionLabel="Try again"
                onAction={() => void requestLocation()}
              />
            ) : (
              <EmptyState
                emoji="🌍"
                title={`No events within ${radius} km`}
                description="Pick a bigger radius, or open the map to pin one yourself."
                actionLabel="Open map"
                onAction={goToMap}
              />
            )
          }
          renderItem={({ item }) => (
            <View className="gap-2">
              <EventCard
                event={item.event}
                distanceLabel={formatDistance(item.km)}
                onPress={() => openMapWithEvent(item.event.id)}
              />
              <View className="flex-row items-center pl-3">
                <ActionChip
                  icon="location"
                  label="View on map"
                  onPress={() => openMapWithEvent(item.event.id)}
                />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={tab === 'created' ? created : joined}
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
              onAction={goToMap}
            />
          }
          renderItem={({ item }) => (
            <View className="gap-2">
              <EventCard event={item} onPress={() => openMapWithEvent(item.id)} />
              {tab === 'created' ? (
                <View className="flex-row items-center gap-2 pl-3">
                  <ActionChip
                    icon="location"
                    label="View on map"
                    onPress={() => openMapWithEvent(item.id)}
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
                    onPress={() => openMapWithEvent(item.id)}
                  />
                </View>
              )}
            </View>
          )}
        />
      )}

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

// ── Local building blocks ────────────────────────────────────────────

const segmentActive =
  'flex-1 items-center justify-center rounded-xl py-2 bg-panel-light dark:bg-panel-dark';
const segmentInactive = 'flex-1 items-center justify-center rounded-xl py-2';

function SegmentButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className={active ? segmentActive : segmentInactive}>
      <View className="flex-row items-center gap-1.5">
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
        {count != null ? (
          <Text
            className={[
              'font-mono text-[10px]',
              active
                ? 'text-text-light/70 dark:text-text-dark/70'
                : 'text-muted-light',
            ].join(' ')}
          >
            {count}
          </Text>
        ) : null}
      </View>
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
