import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/components/ui/Toast';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { useT } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { distanceKm, formatDistance } from '@/utils/distance';
import { isEventPast } from '@/utils/eventTime';
import type { EventWithCreator } from '@/types';

type Tab = 'created' | 'joined' | 'nearby' | 'past';

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
  const t = useT();
  const toast = useToast();
  const { profile } = useAuth();
  const { coords, status: locStatus, request: requestLocation } = useLocation();
  const events = useEventsStore((s) => s.events);
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const syncViewport = useEventsStore((s) => s.syncViewport);
  const [tab, setTab] = useState<Tab>('created');
  const [radius, setRadius] = useState<Radius>(5);
  const [editEvent, setEditEvent] = useState<EventWithCreator | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventWithCreator | null>(null);

  // Ticks every minute so the "past" bucket re-partitions without
  // requiring a full re-fetch — an event that crosses the 1h grace
  // cutoff while the tab is open moves into Past within a minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Imported events live in the store per-viewport, which the map fills
  // in. Nearby has to work on its own too (open the app → Events →
  // Nearby, never touching the map), so it loads the box around the
  // chosen radius itself. 1° lat ≈ 111 km; longitude degrees shrink
  // toward the poles, hence the cos(lat) correction.
  useEffect(() => {
    if (tab !== 'nearby' || !coords) return;
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.max(0.01, Math.cos((coords.latitude * Math.PI) / 180)));
    void syncViewport(
      {
        minLat: coords.latitude - dLat,
        maxLat: coords.latitude + dLat,
        minLng: coords.longitude - dLng,
        maxLng: coords.longitude + dLng,
      },
      profile?.id ?? null,
    );
  }, [tab, coords, radius, syncViewport, profile?.id]);

  const valid = useMemo(
    () => events.filter((e): e is EventWithCreator => !!e && !!e.id),
    [events],
  );

  /** For nearby: pair every event with its distance so we can sort +
   *  filter + render distance labels off the same pass. Past events
   *  are dropped here too — they're only useful in the Past bucket. */
  const nearby = useMemo(() => {
    if (!coords) return [];
    return valid
      .filter((e) => !isEventPast(e, now))
      .map((event) => ({
        event,
        km: distanceKm(coords, {
          latitude: event.latitude,
          longitude: event.longitude,
        }),
      }))
      .filter(({ km }) => km <= radius)
      .sort((a, b) => a.km - b.km);
  }, [valid, coords, radius, now]);

  const created = useMemo(() => {
    if (!profile) return [];
    return valid
      .filter((e) => e.creator_id === profile.id)
      .filter((e) => !isEventPast(e, now));
  }, [valid, profile, now]);

  const joined = useMemo(() => {
    return valid
      .filter((e) => e.is_joined === true)
      .filter((e) => !isEventPast(e, now));
  }, [valid, now]);

  /** Past bucket = anything the viewer created OR joined that's now
   *  past the 1h grace. `valid` is already unique by id, so filtering
   *  on the OR predicate can't produce duplicates — earlier versions
   *  built this from `[...mine, ...joined]`, which double-counted the
   *  creator's own events (they auto-join at create time) and blew up
   *  the FlatList with two children under the same key. Sorted
   *  newest-first so the last thing that ended sits at the top. */
  const past = useMemo(() => {
    if (!profile) return [];
    return valid
      .filter(
        (e) => (e.creator_id === profile.id || e.is_joined) && isEventPast(e, now),
      )
      .sort((a, b) =>
        `${b.event_date}T${b.event_time}`.localeCompare(
          `${a.event_date}T${a.event_time}`,
        ),
      );
  }, [valid, profile, now]);

  /** Join / leave straight from the list — no map round-trip needed.
   *  Optimistic (patchEvent flips is_joined + count immediately); rolls
   *  back and surfaces a friendly message if the DB rejects it (e.g. the
   *  event filled up between render and tap). Mirrors the peek sheet. */
  const handleJoinToggle = useCallback(
    async (event: EventWithCreator) => {
      if (!profile) return;
      const wasJoined = !!event.is_joined;
      const isFull =
        event.max_participants != null &&
        event.participant_count >= event.max_participants;
      if (!wasJoined && isFull) {
        toast.show(t('events.full'), 'info');
        return;
      }
      patchEvent(event.id, {
        is_joined: !wasJoined,
        participant_count: Math.max(
          0,
          event.participant_count + (wasJoined ? -1 : 1),
        ),
      });
      try {
        if (wasJoined) await eventsService.leave(event.id, profile.id);
        else await eventsService.join(event.id, profile.id);
      } catch (e) {
        patchEvent(event.id, {
          is_joined: wasJoined,
          participant_count: event.participant_count,
        });
        const raw = e instanceof Error ? e.message : '';
        toast.show(
          /is full/i.test(raw)
            ? t('events.justFilled')
            : raw || t('events.couldNotUpdate'),
          'error',
        );
      }
    },
    [profile, patchEvent, toast],
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await eventsService.remove(target.id);
      removeEvent(target.id);
      toast.show(t('events.deleted'), 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('events.couldNotDelete'), 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      {/* Header + segmented tabs */}
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          {t('events.title')}
        </Text>
        {/* Four equal-width segments spanning the full row. Count
            renders only on the active pill so labels stay legible even
            on narrow phones where four chips + four numerals would
            crowd the text off-center. */}
        <View className="mt-4 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
          <SegmentButton
            label={t('events.tabCreated')}
            count={tab === 'created' ? created.length : null}
            active={tab === 'created'}
            onPress={() => setTab('created')}
          />
          <SegmentButton
            label={t('events.tabJoined')}
            count={tab === 'joined' ? joined.length : null}
            active={tab === 'joined'}
            onPress={() => setTab('joined')}
          />
          <SegmentButton
            label={t('events.tabNearby')}
            count={tab === 'nearby' && coords ? nearby.length : null}
            active={tab === 'nearby'}
            onPress={() => setTab('nearby')}
          />
          <SegmentButton
            label={t('events.tabPast')}
            count={tab === 'past' ? past.length : null}
            active={tab === 'past'}
            onPress={() => setTab('past')}
          />
        </View>
      </View>

      {/* Nearby subheader — radius chips + status. */}
      {tab === 'nearby' ? (
        <View className="px-5 pb-2 pt-1">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {t('events.radius')}
            </Text>
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {coords
                ? t('events.withinRadius', { n: nearby.length, km: radius })
                : locStatus === 'requesting'
                  ? t('events.locating')
                  : t('events.noLocation')}
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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            !coords ? (
              <EmptyState
                emoji="📍"
                title={t('events.enableLocationTitle')}
                description={
                  locStatus === 'denied'
                    ? t('events.locationDenied')
                    : t('events.locationNeeded')
                }
                actionLabel={t('events.tryAgain')}
                onAction={() => void requestLocation()}
              />
            ) : (
              <EmptyState
                emoji="🌍"
                title={t('events.noneWithin', { km: radius })}
                description={t('events.widenRadius')}
                actionLabel={t('events.openMap')}
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
              <View className="flex-row items-center gap-2 pl-3">
                <JoinButton
                  event={item.event}
                  viewerId={profile?.id ?? null}
                  onToggle={() => void handleJoinToggle(item.event)}
                />
                <ActionChip
                  icon="location"
                  label={t('events.viewOnMap')}
                  onPress={() => openMapWithEvent(item.event.id)}
                />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={
            tab === 'created' ? created : tab === 'joined' ? joined : past
          }
          keyExtractor={(e) => e.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              emoji={
                tab === 'created' ? '📍' : tab === 'joined' ? '🙋' : '🕰️'
              }
              title={
                tab === 'created'
                  ? t('events.emptyCreated')
                  : tab === 'joined'
                    ? t('events.emptyJoined')
                    : t('events.emptyPast')
              }
              description={
                tab === 'created'
                  ? t('events.emptyCreatedHint')
                  : tab === 'joined'
                    ? t('events.emptyJoinedHint')
                    : t('events.emptyPastHint')
              }
              actionLabel={tab === 'past' ? undefined : t('events.openMap')}
              onAction={tab === 'past' ? undefined : goToMap}
            />
          }
          renderItem={({ item }) => (
            <View className="gap-2">
              <EventCard event={item} onPress={() => openMapWithEvent(item.id)} />
              {tab === 'created' ? (
                <View className="flex-row items-center gap-2 pl-3">
                  <ActionChip
                    icon="location"
                    label={t('events.viewOnMap')}
                    onPress={() => openMapWithEvent(item.id)}
                  />
                  <ActionChip
                    icon="create-outline"
                    label={t('events.edit')}
                    onPress={() => setEditEvent(item)}
                  />
                  <ActionChip
                    icon="trash-outline"
                    label={t('common.delete')}
                    tone="danger"
                    onPress={() => setPendingDelete(item)}
                  />
                </View>
              ) : tab === 'past' ? (
                <View className="flex-row items-center gap-2 pl-3">
                  <ActionChip
                    icon="ellipse-outline"
                    label={t('events.ended')}
                    onPress={() => {}}
                  />
                  {profile && item.creator_id === profile.id ? (
                    <ActionChip
                      icon="trash-outline"
                      label={t('common.delete')}
                      tone="danger"
                      onPress={() => setPendingDelete(item)}
                    />
                  ) : null}
                </View>
              ) : (
                <View className="flex-row items-center pl-3">
                  <ActionChip
                    icon="location"
                    label={t('events.viewOnMap')}
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
        title={t('events.deleteTitle')}
        message={t('events.deleteMessage')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

// ── Local building blocks ────────────────────────────────────────────

const segmentActive =
  'flex-1 items-center justify-center rounded-xl py-2 px-1 bg-panel-light dark:bg-panel-dark';
const segmentInactive = 'flex-1 items-center justify-center rounded-xl py-2 px-1';

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
      <View className="flex-row items-center gap-1">
        <Text
          numberOfLines={1}
          className={[
            'text-[13px] font-semibold',
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

/** Nearby-list join affordance. Reflects the four states the peek does —
 *  hosting, joined, full, joinable — so the list can join without a map
 *  detour. Joinable is a filled brand pill; the rest are quiet status
 *  chips (joined stays tappable to leave). */
function JoinButton({
  event,
  viewerId,
  onToggle,
}: {
  event: EventWithCreator;
  viewerId: string | null;
  onToggle: () => void;
}) {
  const t = useT();
  const isCreator = !!viewerId && event.creator_id === viewerId;
  const isFull =
    event.max_participants != null &&
    event.participant_count >= event.max_participants;

  if (isCreator) {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-brand-500/10 px-3 py-1.5">
        <Ionicons name="star" size={12} color="#4B5FE0" />
        <Text className="text-[11px] font-semibold text-brand-500">{t('events.hosting')}</Text>
      </View>
    );
  }
  if (event.is_joined) {
    return (
      <Pressable
        onPress={onToggle}
        hitSlop={4}
        className="flex-row items-center gap-1 rounded-full border border-border-light bg-panel-light px-3 py-1.5 active:opacity-70 dark:border-border-dark dark:bg-panel-dark"
      >
        <Ionicons name="checkmark-circle" size={13} color="#4B5FE0" />
        <Text className="text-[11px] font-semibold text-brand-500">{t('events.joined')}</Text>
      </Pressable>
    );
  }
  if (isFull) {
    return (
      <View className="flex-row items-center gap-1 rounded-full border border-border-light bg-panel-light px-3 py-1.5 dark:border-border-dark dark:bg-panel-dark">
        <Ionicons name="lock-closed" size={12} color="#8B8880" />
        <Text className="text-[11px] font-semibold text-muted-light">{t('events.fullShort')}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={4}
      className="flex-row items-center gap-1 rounded-full bg-brand-500 px-3.5 py-1.5 active:opacity-90"
    >
      <Ionicons name="add" size={14} color="#fff" />
      <Text className="text-[11px] font-bold text-white">{t('events.joinEvent')}</Text>
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
