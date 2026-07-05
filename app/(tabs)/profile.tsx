import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useEventsStore } from '@/store/events.store';
import type { EventWithCreator } from '@/types';

type Tab = 'hosting' | 'attending' | 'past';

/** "You" tab — the redesigned profile screen. Big avatar + display
 *  name + @handle line, mono uppercase stats row (Events / Joined),
 *  segmented Hosting / Attending / Past control with a matching
 *  event list beneath. */
export default function YouScreen() {
  const toast = useToast();
  const { profile, signOut } = useAuth();
  const events = useEventsStore((s) => s.events);
  const focusEvent = useEventsStore((s) => s.focusEvent);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('hosting');

  const { hostingCount, attendingCount, hosting, attending, past } = useMemo(() => {
    if (!profile) {
      return { hostingCount: 0, attendingCount: 0, hosting: [], attending: [], past: [] };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = (e: EventWithCreator) => {
      const d = new Date(`${e.event_date}T${e.event_time}`);
      return d < today;
    };
    const mine = events.filter((e) => e.creator_id === profile.id);
    const joined = events.filter((e) => e.is_joined);
    return {
      hostingCount: mine.length,
      attendingCount: joined.filter((e) => e.creator_id !== profile.id).length,
      hosting: mine.filter((e) => !isPast(e)),
      attending: joined.filter((e) => e.creator_id !== profile.id && !isPast(e)),
      past: [...mine, ...joined].filter(isPast),
    };
  }, [events, profile]);

  const list = tab === 'hosting' ? hosting : tab === 'attending' ? attending : past;

  const openOnMap = (event: EventWithCreator) => {
    focusEvent(event.id);
    router.push('/(tabs)/map');
  };

  const handleSignOut = async () => {
    setConfirmOpen(false);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not sign out', 'error');
    }
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

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View className="gap-6 px-5 pt-2 pb-4">
            {/* Kebab row — reserved for future edit / settings menu. */}
            <View className="flex-row items-center justify-between">
              <View />
              <Pressable
                onPress={() => setConfirmOpen(true)}
                accessibilityLabel="Sign out"
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
              >
                <Ionicons name="log-out-outline" size={16} color="#0E0E10" />
              </Pressable>
            </View>

            {/* Identity */}
            <View className="items-center gap-3">
              <Avatar name={profile.display_name} uri={profile.avatar_url} size="xl" />
              <View className="items-center">
                <Text className="font-display text-4xl leading-tight text-text-light dark:text-text-dark">
                  {profile.display_name}
                </Text>
                <Text className="text-sm text-muted-light">@{profile.username}</Text>
              </View>
            </View>

            {/* Actions (own profile) */}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label="Edit profile"
                  variant="secondary"
                  onPress={() =>
                    toast.show('Profile editing lands in the next update.', 'info')
                  }
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  label="Share"
                  variant="secondary"
                  leftIcon={
                    <Ionicons name="share-outline" size={14} color="#0E0E10" />
                  }
                  onPress={() =>
                    toast.show('Sharing lands in the next update.', 'info')
                  }
                  fullWidth
                />
              </View>
            </View>

            {/* Stats row — mono uppercase, matches the PDF */}
            <View className="flex-row items-center justify-around rounded-2xl border border-border-light bg-panel-light py-4 dark:border-border-dark dark:bg-panel-dark">
              <Stat value={hostingCount} label="Hosted" />
              <View className="h-8 w-px bg-border-light dark:bg-border-dark" />
              <Stat value={attendingCount} label="Attending" />
            </View>

            {/* Segmented control — Hosting / Attending / Past */}
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

      <ConfirmationDialog
        open={confirmOpen}
        title="Sign out?"
        message="You'll need to sign back in to see your events."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setConfirmOpen(false)}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center gap-1">
      <Text className="font-display text-2xl leading-none text-text-light dark:text-text-dark">
        {value}
      </Text>
      <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
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
