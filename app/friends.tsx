import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { friendshipsService, type FriendRow } from '@/services/friendships.service';
import { goBack } from '@/utils/nav';

type Tab = 'friends' | 'requests';

/** Full friends list + inbound requests. Rows route to the DM room. */
export default function FriendsScreen() {
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
      toast.show(e instanceof Error ? e.message : 'Could not load friends', 'error');
    } finally {
      setLoading(false);
    }
  }, [viewerId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = useCallback(
    async (row: FriendRow) => {
      try {
        await friendshipsService.request(row.other.id);
        await load();
        toast.show(`You and ${row.other.display_name} are friends now.`, 'success');
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Could not accept', 'error');
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
        toast.show(e instanceof Error ? e.message : 'Could not remove', 'error');
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
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          Friends
        </Text>
        <View className="h-9 w-9" />
      </View>

      <View className="px-5 pb-3 pt-2">
        <View className="mt-2 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
          <Segment
            label="Friends"
            count={friends.length}
            selected={tab === 'friends'}
            onPress={() => setTab('friends')}
          />
          <Segment
            label="Requests"
            count={pending.length}
            selected={tab === 'requests'}
            onPress={() => setTab('requests')}
          />
        </View>
      </View>

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
            <EmptyState emoji="⏳" title="Loading…" />
          ) : tab === 'friends' ? (
            <EmptyState
              emoji="🫂"
              title="No friends yet"
              description="Tap Add friend on a profile — once they accept, they'll show up here."
              actionLabel="Open map"
              onAction={() => router.push('/(tabs)/map')}
            />
          ) : (
            <EmptyState
              emoji="📥"
              title="No pending requests"
              description="Friend requests from other users appear here."
            />
          )
        }
      />

      <ConfirmationDialog
        open={!!pendingUnfriend}
        title={`Remove ${pendingUnfriend?.other.display_name ?? ''} from friends?`}
        message="You'll both stop being friends and lose unlimited messaging. You can add them again later."
        confirmLabel="Remove"
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
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 dark:border-border-dark dark:bg-panel-dark">
      <Pressable onPress={onOpenProfile} className="flex-1 flex-row items-center gap-3">
        <Avatar name={row.other.display_name} uri={row.other.avatar_url} size="sm" />
        <View className="flex-1">
          <Text
            className="text-[15px] font-semibold text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {row.other.display_name}
          </Text>
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
            <Text className="ml-1.5 text-xs font-semibold text-white">Message</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            className="h-9 w-9 items-center justify-center rounded-full border border-red-300"
            accessibilityLabel="Unfriend"
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
            <Text className="text-xs font-semibold text-white">Accept</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            className="h-9 w-9 items-center justify-center rounded-full border border-red-300"
            accessibilityLabel="Reject"
          >
            <Ionicons name="close" size={14} color="#EF4444" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
