import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { Avatar } from '@/components/ui/Avatar';
import { useIconColor } from '@/hooks/useIconColor';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { eventsService } from '@/services/events.service';
import { profilesService } from '@/services/profiles.service';
import { supabase } from '@/services/supabase';
import { useEventsStore } from '@/store/events.store';
import { isEventPast } from '@/utils/eventTime';
import { INTERESTS_BY_KEY } from '@/utils/interests';
import type { EventWithCreator, Profile } from '@/types';

/** Public read-only profile for a host. Reached from the "View
 *  <name>'s profile" button in the event peek. Shows the host's
 *  avatar / name / handle, their bio, interest chips, and every
 *  event they've created split into Upcoming and Past buckets.
 *
 *  We already have every event in the store — no separate creator-
 *  events endpoint needed. Just filter locally. */
export default function UserProfileScreen() {
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const events = useEventsStore((s) => s.events);
  const focusEvent = useEventsStore((s) => s.focusEvent);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    profilesService
      .getById(userId)
      .then((row) => {
        if (!cancelled) setProfile(row);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.show(
            e instanceof Error ? e.message : 'Could not load profile',
            'error',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, toast]);

  // Prefer events already in the store — they're enriched with
  // creator + participant_count. But a viewer arriving here without
  // having loaded the map yet won't have them, so fall back to a
  // one-shot fetch when the store is empty for this host.
  const [fallbackEvents, setFallbackEvents] = useState<EventWithCreator[]>([]);
  useEffect(() => {
    if (!userId) return;
    const inStore = events.some((e) => e.creator_id === userId);
    if (inStore || events.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data: authData } = await supabase.auth.getSession();
      const viewerId = authData.session?.user.id ?? null;
      try {
        const rows = await eventsService.list(viewerId);
        if (!cancelled) setFallbackEvents(rows);
      } catch {
        /* silent — the empty state will just show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, events]);

  const { upcoming, past } = useMemo(() => {
    const src = events.length > 0 ? events : fallbackEvents;
    const now = new Date();
    const mine = src.filter((e) => e.creator_id === userId);
    return {
      upcoming: mine.filter((e) => !isEventPast(e, now)),
      past: mine
        .filter((e) => isEventPast(e, now))
        .sort((a, b) =>
          `${b.event_date}T${b.event_time}`.localeCompare(
            `${a.event_date}T${a.event_time}`,
          ),
        ),
    };
  }, [events, fallbackEvents, userId]);

  const list = tab === 'upcoming' ? upcoming : past;

  const openOnMap = (event: EventWithCreator) => {
    focusEvent(event.id);
    router.replace('/(tabs)/map');
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <Text className="text-sm text-muted-light">Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <Header onBack={() => router.back()} title="Profile" />
        <EmptyState
          emoji="👤"
          title="Profile not found"
          description="This user may have deleted their account."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const interests = (profile.interests ?? [])
    .map((k) => INTERESTS_BY_KEY[k])
    .filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <Header onBack={() => router.back()} title={`@${profile.username}`} />

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingTop: 4, flexGrow: 1 }}
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            {/* Identity */}
            <View className="flex-row items-center gap-4">
              <Avatar name={profile.display_name} uri={profile.avatar_url} size="xl" />
              <View className="flex-1">
                <Text
                  className="font-display text-3xl leading-tight text-text-light dark:text-text-dark"
                  numberOfLines={1}
                >
                  {profile.display_name}
                </Text>
                <Text
                  className="text-sm text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  @{profile.username}
                </Text>
              </View>
            </View>

            {/* Bio */}
            {profile.bio ? (
              <Text className="text-[15px] leading-snug text-text-light dark:text-text-dark">
                {profile.bio}
              </Text>
            ) : null}

            {/* Interest chips */}
            {interests.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {interests.map((i) => (
                  <View
                    key={i.key}
                    className="flex-row items-center gap-1.5 rounded-xl border border-border-light bg-panel-light px-2.5 py-1.5 dark:border-border-dark dark:bg-panel-dark"
                  >
                    <Text style={{ fontSize: 12 }}>{i.emoji}</Text>
                    <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark">
                      {i.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Stats + segmented */}
            <View className="flex-row items-center gap-6 border-b border-border-light dark:border-border-dark">
              <SegmentTab
                label={`Upcoming · ${upcoming.length}`}
                active={tab === 'upcoming'}
                onPress={() => setTab('upcoming')}
              />
              <SegmentTab
                label={`Past · ${past.length}`}
                active={tab === 'past'}
                onPress={() => setTab('past')}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => openOnMap(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            emoji={tab === 'upcoming' ? '📍' : '🗓️'}
            title={
              tab === 'upcoming'
                ? "Nothing on the calendar right now"
                : 'No past events'
            }
            description={
              tab === 'upcoming'
                ? `${profile.display_name} hasn't scheduled anything upcoming.`
                : 'Older events they hosted will show up here.'
            }
          />
        }
      />
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  const iconColor = useIconColor();
  return (
    <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back"
        hitSlop={10}
        className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
      >
        <Ionicons name="chevron-back" size={18} color={iconColor} />
      </Pressable>
      <Text className="text-lg font-bold text-text-light dark:text-text-dark">
        {title}
      </Text>
      <View className="h-9 w-9" />
    </View>
  );
}

function SegmentTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="pb-3 pt-1">
      <View
        className={[
          'border-b-2',
          active ? 'border-text-light dark:border-text-dark' : 'border-transparent',
        ].join(' ')}
      >
        <Text
          className={[
            'text-sm font-semibold pb-2',
            active ? 'text-text-light dark:text-text-dark' : 'text-muted-light',
          ].join(' ')}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
