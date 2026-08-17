import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useT, type TranslationKey } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventFilter, EventWithCreator } from '@/types';

type Props = {
  query: string;
  onQuery: (q: string) => void;
  filter: EventFilter;
  onFilter: (f: EventFilter) => void;
  /** Label for the Dates chip once a range is set, and the opener. */
  dateLabel?: string | null;
  onPickDates?: () => void;
  events: EventWithCreator[];
  selectedEventId: string | null;
  onEventPress: (id: string) => void;
};

const FILTERS: { key: EventFilter; labelKey: TranslationKey }[] = [
  { key: 'all',      labelKey: 'filter.all' },
  { key: 'today',    labelKey: 'filter.today' },
  { key: 'tomorrow', labelKey: 'filter.tomorrow' },
  { key: 'week',     labelKey: 'filter.week' },
  { key: 'nearby',   labelKey: 'filter.nearby' },
  { key: 'joined',   labelKey: 'filter.joined' },
  { key: 'created',  labelKey: 'filter.created' },
];

/** Floating left-rail card for the desktop map. Contains the app
 *  identity, search, filter chips, and a scrollable event list.
 *  Rendered only when the viewport is wide enough (see useIsDesktop). */
export function MapSidebar({
  query,
  onQuery,
  filter,
  onFilter,
  dateLabel,
  onPickDates,
  events,
  selectedEventId,
  onEventPress,
}: Props) {
  const t = useT();
  const { profile } = useAuth();
  const iconColor = useIconColor();
  const initials = (profile?.display_name ?? 'AK')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View
      className="absolute left-5 top-5 bottom-5 w-[330px] flex-col overflow-hidden rounded-3xl border border-border-light bg-panel-light shadow-lg shadow-black/25 dark:border-border-dark dark:bg-panel-dark"
      pointerEvents="box-none"
    >
      {/* Header ---------------------------------------------------- */}
      <View className="flex-row items-center justify-between px-5 pt-5">
        <View className="flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-md bg-text-light dark:bg-text-dark">
            <Text className="font-display text-lg text-surface-light dark:text-surface-dark">
              M
            </Text>
          </View>
          <Text className="font-display text-xl text-text-light dark:text-text-dark">
            MapMeet
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Pressable
            className="h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
            accessibilityLabel={t('sidebar.notifications')}
          >
            <Ionicons name="notifications-outline" size={16} color={iconColor} />
          </Pressable>
          <Avatar name={profile?.display_name ?? initials} uri={profile?.avatar_url} size="sm" />
        </View>
      </View>

      {/* Search ---------------------------------------------------- */}
      <View className="px-5 pt-4">
        <View className="relative h-11 flex-row items-center rounded-xl border border-border-light bg-elevated-light px-3 dark:border-border-dark dark:bg-elevated-dark">
          <Ionicons name="search" size={15} color="#8B8880" />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder={t('sidebar.searchPlaceholder')}
            placeholderTextColor="#8B8880"
            className="ml-2 flex-1 text-sm text-text-light outline-none dark:text-text-dark"
          />
          <View className="rounded-md border border-border-light bg-panel-light px-1.5 py-0.5 dark:border-border-dark dark:bg-panel-dark">
            <Text className="font-mono text-[9px] uppercase text-muted-light">⌘K</Text>
          </View>
        </View>
      </View>

      {/* Filter chips (wrapping, matches the design's two-row look) */}
      <View className="px-5 pt-3">
        <View className="flex-row flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() =>
                  f.key === 'dates' && onPickDates
                    ? onPickDates()
                    : onFilter(f.key)
                }
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
                  {f.key === 'dates' && dateLabel ? dateLabel : t(f.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Section header ------------------------------------------- */}
      <View className="mt-4 border-t border-border-light px-5 pt-4 dark:border-border-dark">
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {events.length} events · this area
          </Text>
          <View className="flex-row items-center gap-1">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              Sort · Soonest
            </Text>
            <Ionicons name="chevron-down" size={10} color="#8B8880" />
          </View>
        </View>
      </View>

      {/* Event list ----------------------------------------------- */}
      <ScrollView
        className="mt-3"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}
      >
        {events.map((event) => (
          <SidebarEventRow
            key={event.id}
            event={event}
            selected={event.id === selectedEventId}
            onPress={() => onEventPress(event.id)}
          />
        ))}
        {events.length === 0 ? (
          <View className="items-center px-4 py-10">
            <Text className="text-center text-sm text-muted-light">
              {t('sidebar.noneInArea')}
            </Text>
            <Text className="mt-1 text-center text-xs text-muted-light">
              {t('sidebar.noneInAreaHint')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Row -------------------------------------------------------------
function SidebarEventRow({
  event,
  selected,
  onPress,
}: {
  event: EventWithCreator;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80',
        selected
          ? 'border-text-light bg-panel-light dark:border-text-dark dark:bg-panel-dark'
          : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
      ].join(' ')}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
        <Text style={{ fontSize: 22 }}>{event.emoji}</Text>
      </View>
      <View className="flex-1 gap-1">
        {selected ? (
          <View className="flex-row flex-wrap items-center gap-1">
            <Badge
              tone="primary"
              label={`${formatEventDate(event.event_date)} · ${formatEventTime(event.event_time)}`}
            />
          </View>
        ) : null}
        <Text
          className="text-sm font-semibold text-text-light dark:text-text-dark"
          numberOfLines={selected ? 2 : 1}
        >
          {event.title}
        </Text>
        <Text
          className="font-mono text-[10px] uppercase text-muted-light"
          numberOfLines={1}
        >
          {event.creator.display_name} · {t('preview.going', { count: event.participant_count })}
        </Text>
      </View>
      {event.is_joined && !selected ? (
        <Badge tone="primary" label={t('filter.joined')} />
      ) : null}
      {event.visibility === 'private' ? (
        <Ionicons name="lock-closed" size={12} color="#8B8880" />
      ) : null}
    </Pressable>
  );
}
