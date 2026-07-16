import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { type ChatPreview } from '@/services/messages.service';
import { useChatStore } from '@/store/chat.store';
import { useEventsStore } from '@/store/events.store';
import { isEventPast } from '@/utils/eventTime';
import { formatRelativeTime } from '@/utils/format';
import type { EventWithCreator } from '@/types';

type Folder = 'active' | 'archive';

export default function ChatScreen() {
  return (
    <ErrorBoundary where="Chat">
      <ChatListBody />
    </ErrorBoundary>
  );
}

/** One row per chat the viewer belongs to — i.e. every event they host
 *  or joined. The chat id IS the event id, so membership falls straight
 *  out of the events store with zero extra fetches. */
function ChatListBody() {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const events = useEventsStore((s) => s.events);
  const [folder, setFolder] = useState<Folder>('active');

  // Same per-minute tick the Events tab uses, so a chat migrates from
  // Active → Archive at the moment its event crosses the 1h-grace
  // cutoff, without a refetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Chats = hosted or joined events. Active holds live events;
  // Archive keeps every wrapped event's chat readable as history.
  const { active, archive } = useMemo(() => {
    if (!viewerId) return { active: [], archive: [] };
    const mine = events.filter((e) => e.creator_id === viewerId || e.is_joined);
    return {
      active: mine.filter((e) => !isEventPast(e, now)),
      archive: mine.filter((e) => isEventPast(e, now)),
    };
  }, [events, viewerId, now]);

  const chats = folder === 'active' ? active : archive;

  // Previews (last message + unread) come from the shared chat store,
  // kept live by `useChatSync` in the tabs layout — so the list and the
  // tab-bar badge always agree, from one subscription.
  const previews = useChatStore((s) => s.previews);

  // Sort: chats with newest messages first; chats without messages fall
  // back to event creation order.
  const sorted = useMemo(() => {
    return [...chats].sort((a, b) => {
      const ta = previews.get(a.id)?.lastMessage?.created_at ?? a.created_at;
      const tb = previews.get(b.id)?.lastMessage?.created_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
  }, [chats, previews]);

  // Unread across the archive still matters (a chat can wrap with
  // messages the viewer never opened) — badge the folder tab.
  const archiveUnread = archive.reduce(
    (sum, e) => sum + (previews.get(e.id)?.unreadCount ?? 0),
    0,
  );
  const activeUnread = active.reduce(
    (sum, e) => sum + (previews.get(e.id)?.unreadCount ?? 0),
    0,
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          Chats
        </Text>
        {/* Active / Archive folders */}
        <View className="mt-4 flex-row rounded-2xl border border-border-light bg-elevated-light p-1 dark:border-border-dark dark:bg-elevated-dark">
          <FolderTab
            label="Active"
            count={active.length}
            unread={activeUnread}
            selected={folder === 'active'}
            onPress={() => setFolder('active')}
          />
          <FolderTab
            label="Archive"
            count={archive.length}
            unread={archiveUnread}
            selected={folder === 'archive'}
            onPress={() => setFolder('archive')}
          />
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10, flexGrow: 1 }}
        renderItem={({ item }) => (
          <ChatRow
            event={item}
            preview={previews.get(item.id)}
            isHost={item.creator_id === viewerId}
            viewerId={viewerId}
          />
        )}
        ListEmptyComponent={
          folder === 'active' ? (
            <EmptyState
              emoji="💬"
              title="No active chats"
              description="Join an event on the map — every event comes with its own group chat."
              actionLabel="Open map"
              onAction={() => router.push('/(tabs)/map')}
            />
          ) : (
            <EmptyState
              emoji="🗂️"
              title="Archive is empty"
              description="Once an event wraps, its chat moves here so the history stays readable."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function FolderTab({
  label,
  count,
  unread,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  unread: number;
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
      {selected ? (
        <Text className="font-mono text-[10px] text-text-light/70 dark:text-text-dark/70">
          {count}
        </Text>
      ) : null}
      {unread > 0 ? (
        <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-400 px-1">
          <Text className="text-[9px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function previewText(preview: ChatPreview | undefined): string {
  const m = preview?.lastMessage;
  if (!m) return 'No messages yet — say hi 👋';
  switch (m.type) {
    case 'text':
      return m.text ?? '';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'location':
      return '📍 Location';
    case 'audio':
      return '🎤 Voice message';
    case 'system':
      return m.text ?? '';
  }
}

function ChatRow({
  event,
  preview,
  isHost,
  viewerId,
}: {
  event: EventWithCreator;
  preview: ChatPreview | undefined;
  isHost: boolean;
  viewerId: string | null;
}) {
  const unread = preview?.unreadCount ?? 0;
  const last = preview?.lastMessage;
  const lastIsOwn = !!(last && viewerId && last.sender_id === viewerId);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: event.id } })}
      className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 active:opacity-80 dark:border-border-dark dark:bg-panel-dark"
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-elevated-light dark:bg-elevated-dark">
        <Text style={{ fontSize: 22 }}>{event.emoji}</Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            className="flex-1 text-[15px] font-semibold text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {event.title}
          </Text>
          {isHost ? <Ionicons name="star" size={11} color="#E68A5E" /> : null}
          {last ? (
            <Text className="font-mono text-[9px] uppercase text-muted-light">
              {formatRelativeTime(last.created_at)}
            </Text>
          ) : null}
        </View>
        <Text
          className={[
            'mt-0.5 text-[13px]',
            unread > 0
              ? 'font-semibold text-text-light dark:text-text-dark'
              : 'text-muted-light dark:text-muted-dark',
          ].join(' ')}
          numberOfLines={1}
        >
          {lastIsOwn && last?.type === 'text' ? 'You: ' : ''}
          {previewText(preview)}
        </Text>
      </View>

      {unread > 0 ? (
        <View className="h-6 min-w-[24px] items-center justify-center rounded-full bg-accent-400 px-1.5">
          <Text className="text-[11px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
