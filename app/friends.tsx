import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { SearchBar } from '@/components/events/SearchBar';
import { friendshipsService, type FriendRow } from '@/services/friendships.service';
import { profilesService, type PublicProfile } from '@/services/profiles.service';
import { goBack } from '@/utils/nav';

type Tab = 'friends' | 'requests';

/** Long enough that a handle typed at speed is one query rather than
 *  eight, short enough that the list feels like it is keeping up. */
const SEARCH_DEBOUNCE_MS = 250;

/** Full friends list + inbound requests. Rows route to the DM room. */
export default function FriendsScreen() {
  const t = useT();
  const toast = useToast();
  const iconColor = useIconColor();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pending, setPending] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Unfriend is confirmed via a dialog; this holds the friend awaiting
  // that confirmation. Rejecting a *pending request* stays immediate —
  // it isn't removing an established friend.
  const [pendingUnfriend, setPendingUnfriend] = useState<FriendRow | null>(null);

  // Handle search. A non-empty query takes over the list entirely
  // rather than adding a third tab: searching for somebody is what you
  // came here to do, and the tabs are still one tap away once the field
  // is cleared.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const load = useCallback(async () => {
    if (!viewerId) return;
    setLoading(true);
    try {
      const [f, p] = await Promise.all([
        friendshipsService.listFriends(viewerId),
        friendshipsService.listPendingIncoming(viewerId),
      ]);
      setFriends(f);
      setPending(p);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('friends.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [viewerId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced, and every in-flight query carries a cancel flag: results
  // arrive out of order often enough that "ma" answering after "mapmeet"
  // would otherwise leave the wrong list on screen.
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      profilesService
        .search(trimmed)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setResults([]);
          toast.show(e instanceof Error ? e.message : t('friends.searchFailed'), 'error');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `toast` and `t` are stable for the life of the screen; listing them
    // would re-run the search on every render they happen to change on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  const openProfile = useCallback((username: string) => {
    router.navigate({ pathname: '/user/[username]', params: { username } });
  }, []);

  const accept = useCallback(
    async (row: FriendRow) => {
      try {
        await friendshipsService.request(row.other.id);
        await load();
        toast.show(`You and ${row.other.display_name} are friends now.`, 'success');
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('friends.acceptFailed'), 'error');
      }
    },
    [load, toast],
  );

  const remove = useCallback(
    async (row: FriendRow) => {
      try {
        await friendshipsService.remove(row.other.id);
        await load();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('friends.removeFailed'), 'error');
      }
    },
    [load, toast],
  );

  const list = tab === 'friends' ? friends : pending;

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/(tabs)/profile')}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          {t('friends.title')}
        </Text>
        <View className="h-9 w-9" />
      </View>

      <View className="px-5 pb-3 pt-2">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends.searchPlaceholder')}
        />

        {/* The tabs are about your own friends, so they go away while a
            search is running — leaving them would imply the results
            below belong to whichever one is highlighted. */}
        {isSearching ? null : (
          <View className="mt-2 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
            <Segment
              label={t('friends.tabFriends')}
              count={friends.length}
              selected={tab === 'friends'}
              onPress={() => setTab('friends')}
            />
            <Segment
              label={t('friends.tabRequests')}
              count={pending.length}
              selected={tab === 'requests'}
              onPress={() => setTab('requests')}
            />
          </View>
        )}
      </View>

      {isSearching ? (
        <FlatList
          data={results}
          keyExtractor={(row) => row.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 20,
            gap: 10,
            flexGrow: 1,
          }}
          renderItem={({ item }) => (
            <PersonRowView person={item} onPress={() => openProfile(item.username)} />
          )}
          ListEmptyComponent={
            searching ? (
              <EmptyState emoji="🔎" title={t('friends.searching')} />
            ) : (
              <EmptyState
                emoji="🕵️"
                title={t('friends.searchNoResults')}
                description={t('friends.searchNoResultsHint')}
              />
            )
          }
        />
      ) : (
      <FlatList
        data={list}
        keyExtractor={(row) => row.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10, flexGrow: 1 }}
        renderItem={({ item }) => (
          <FriendRowView
            row={item}
            mode={tab}
            onOpenDm={() =>
              router.navigate({
                pathname: '/dm/[username]',
                params: { username: item.other.username },
              })
            }
            onOpenProfile={() =>
              router.navigate({
                pathname: '/user/[username]',
                params: { username: item.other.username },
              })
            }
            onAccept={() => accept(item)}
            onRemove={() =>
              tab === 'friends' ? setPendingUnfriend(item) : remove(item)
            }
          />
        )}
        ListEmptyComponent={
          loading ? (
            <EmptyState emoji="⏳" title={t('common.loading')} />
          ) : tab === 'friends' ? (
            <EmptyState
              emoji="🫂"
              title={t('friends.empty')}
              description={t('friends.emptyHint')}
              actionLabel={t('events.openMap')}
              onAction={() => router.navigate('/(tabs)/map')}
            />
          ) : (
            <EmptyState
              emoji="📥"
              title={t('friends.noRequests')}
              description={t('friends.noRequestsHint')}
            />
          )
        }
      />
      )}

      <ConfirmationDialog
        open={!!pendingUnfriend}
        title={t('user.unfriendTitle', { name: pendingUnfriend?.other.display_name ?? '' })}
        message={t('user.unfriendMessage')}
        confirmLabel={t('common.remove')}
        destructive
        onConfirm={() => {
          const target = pendingUnfriend;
          setPendingUnfriend(null);
          if (target) void remove(target);
        }}
        onCancel={() => setPendingUnfriend(null)}
      />
    </SafeAreaView>
  );
}

function Segment({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={[
        'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2',
        selected ? 'bg-panel-light dark:bg-panel-dark' : '',
      ].join(' ')}
    >
      <Text
        className={[
          'text-sm font-semibold',
          selected
            ? 'text-text-light dark:text-text-dark'
            : 'text-muted-light dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
      {count > 0 ? (
        <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-400 px-1">
          <Text className="text-[9px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** One search hit.
 *
 *  Deliberately plainer than FriendRowView: no Message and no Unfriend,
 *  because neither is available for somebody you have no relationship
 *  with yet. The whole row opens their profile, which is where Add
 *  friend lives — one destination, so there is nothing to aim at. */
function PersonRowView({
  person,
  onPress,
}: {
  person: PublicProfile;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`@${person.username}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 active:opacity-80 dark:border-border-dark dark:bg-panel-dark"
    >
      <Avatar name={person.display_name} uri={person.avatar_url} size="sm" />
      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <Text
            className="shrink text-[15px] font-semibold text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {person.display_name}
          </Text>
          <VerifiedBadge role={person.role} size={12} />
        </View>
        <Text className="text-xs text-muted-light" numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#8B8880" />
    </Pressable>
  );
}

function FriendRowView({
  row,
  mode,
  onOpenDm,
  onOpenProfile,
  onAccept,
  onRemove,
}: {
  row: FriendRow;
  mode: Tab;
  onOpenDm: () => void;
  onOpenProfile: () => void;
  onAccept: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 dark:border-border-dark dark:bg-panel-dark">
      <Pressable onPress={onOpenProfile} className="flex-1 flex-row items-center gap-3">
        <Avatar name={row.other.display_name} uri={row.other.avatar_url} size="sm" />
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Text
              className="shrink text-[15px] font-semibold text-text-light dark:text-text-dark"
              numberOfLines={1}
            >
              {row.other.display_name}
            </Text>
            <VerifiedBadge role={row.other.role} size={12} />
          </View>
          <Text className="text-xs text-muted-light" numberOfLines={1}>
            @{row.other.username}
          </Text>
        </View>
      </Pressable>
      {mode === 'friends' ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={onOpenDm}
            className="h-9 flex-row items-center rounded-full bg-brand-500 px-3"
          >
            <Ionicons name="chatbubble-outline" size={13} color="#fff" />
            <Text className="ml-1.5 text-xs font-semibold text-white">{t('friends.message')}</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            className="h-9 w-9 items-center justify-center rounded-full border border-red-300"
            accessibilityLabel={t('friends.unfriend')}
          >
            <Ionicons name="close" size={14} color="#EF4444" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Pressable
            onPress={onAccept}
            className="h-9 flex-row items-center rounded-full bg-brand-500 px-3"
          >
            <Text className="text-xs font-semibold text-white">{t('friends.accept')}</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            className="h-9 w-9 items-center justify-center rounded-full border border-red-300"
            accessibilityLabel={t('friends.reject')}
          >
            <Ionicons name="close" size={14} color="#EF4444" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
