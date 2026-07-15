import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useEventsStore } from '@/store/events.store';
import { isEventPast } from '@/utils/eventTime';
import { INTERESTS_BY_KEY } from '@/utils/interests';
import type { EventWithCreator } from '@/types';

type Tab = 'hosting' | 'attending' | 'past';

/** "You" tab — the redesigned profile screen. Big avatar + display
 *  name + @handle line, optional bio + interest chips, Events / Joined
 *  stats, and a Hosting / Attending / Past event list. Settings live
 *  behind the ⚙️ button in the header; Edit profile is its own screen. */
export default function YouScreen() {
  const { profile } = useAuth();
  const events = useEventsStore((s) => s.events);
  const focusEvent = useEventsStore((s) => s.focusEvent);
  const [tab, setTab] = useState<Tab>('hosting');

  const { hostingCount, attendingCount, hosting, attending, past } = useMemo(() => {
    if (!profile) {
      return { hostingCount: 0, attendingCount: 0, hosting: [], attending: [], past: [] };
    }
    const now = new Date();
    const mine = events.filter((e) => e.creator_id === profile.id);
    const joined = events.filter((e) => e.is_joined);
    return {
      hostingCount: mine.length,
      attendingCount: joined.filter((e) => e.creator_id !== profile.id).length,
      hosting: mine.filter((e) => !isEventPast(e, now)),
      attending: joined.filter(
        (e) => e.creator_id !== profile.id && !isEventPast(e, now),
      ),
      past: [...mine, ...joined].filter((e) => isEventPast(e, now)),
    };
  }, [events, profile]);

  const list = tab === 'hosting' ? hosting : tab === 'attending' ? attending : past;

  const openOnMap = (event: EventWithCreator) => {
    focusEvent(event.id);
    router.push('/(tabs)/map');
  };

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="👤"
          title="No profile yet"
          description="Your profile will appear here once you sign in."
        />
      </SafeAreaView>
    );
  }

  const interests = (profile.interests ?? [])
    .map((k) => INTERESTS_BY_KEY[k])
    .filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View className="gap-5 px-5 pt-2 pb-4">
            {/* Header row — settings on the right */}
            <View className="flex-row items-center justify-end">
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityLabel="Settings"
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#0E0E10" />
              </Pressable>
            </View>

            {/* Identity block */}
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

            {/* Actions */}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label="Edit profile"
                  onPress={() => router.push('/profile-edit')}
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  label="Settings"
                  variant="secondary"
                  leftIcon={
                    <Ionicons name="settings-outline" size={14} color="#0E0E10" />
                  }
                  onPress={() => router.push('/settings')}
                  fullWidth
                />
              </View>
            </View>

            {/* Stats */}
            <View className="flex-row items-stretch gap-3">
              <StatTile value={hostingCount} label="Events" />
              <StatTile value={attendingCount} label="Attending" />
              <StatTile value={past.length} label="Past" />
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

            {/* Segmented control */}
            <View className="flex-row items-center gap-6 border-b border-border-light dark:border-border-dark">
              <SegmentTab
                label={`Hosting · ${hosting.length}`}
                active={tab === 'hosting'}
                onPress={() => setTab('hosting')}
              />
              <SegmentTab
                label={`Attending · ${attending.length}`}
                active={tab === 'attending'}
                onPress={() => setTab('attending')}
              />
              <SegmentTab
                label="Past"
                active={tab === 'past'}
                onPress={() => setTab('past')}
              />
            </View>
          </View>
        }
        contentContainerStyle={{ padding: 20, gap: 12, paddingTop: 4, flexGrow: 1 }}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => openOnMap(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            emoji={tab === 'hosting' ? '📍' : tab === 'attending' ? '🙋' : '🗓️'}
            title={
              tab === 'hosting'
                ? "You aren't hosting anything yet"
                : tab === 'attending'
                  ? 'No upcoming events joined'
                  : 'No past events'
            }
            description={
              tab === 'past'
                ? "Once your events wrap, they'll show up here."
                : 'Open the map and pin your first event.'
            }
            actionLabel="Open map"
            onAction={() => router.push('/(tabs)/map')}
          />
        }
      />
    </SafeAreaView>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-border-light bg-panel-light px-4 py-3 dark:border-border-dark dark:bg-panel-dark">
      <Text className="font-display text-2xl leading-none text-text-light dark:text-text-dark">
        {value}
      </Text>
      <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
        {label}
      </Text>
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
            active
              ? 'text-text-light dark:text-text-dark'
              : 'text-muted-light',
          ].join(' ')}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
