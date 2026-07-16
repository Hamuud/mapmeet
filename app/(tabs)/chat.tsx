import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { messagesService, type ChatPreview } from '@/services/messages.service';
import { useEventsStore } from '@/store/events.store';
import { formatRelativeTime } from '@/utils/format';
import type { EventWithCreator, Message } from '@/types';

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

  // Chats = hosted or joined events. Past events keep their chats —
  // history stays readable after the meetup wraps.
  const chats = useMemo(() => {
    if (!viewerId) return [];
    return events.filter((e) => e.creator_id === viewerId || e.is_joined);
  }, [events, viewerId]);

  const chatIdsKey = useMemo(
    () => chats.map((c) => c.id).sort().join(','),
    [chats],
  );

  const [previews, setPreviews] = useState<Map<string, ChatPreview>>(new Map());
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const refreshPreviews = useCallback(async () => {
    if (!viewerId || chatsRef.current.length === 0) return;
    try {
      const map = await messagesService.previews(
        chatsRef.current.map((c) => c.id),
        viewerId,
      );
      setPreviews(map);
    } catch {
      // messages table not reachable (e.g. migration not applied yet) —
      // the list still renders event rows without previews.
    }
  }, [viewerId]);

  useEffect(() => {
    void refreshPreviews();
    // Live previews: any INSERT the viewer is allowed to see (RLS scopes
    // the feed to their chats) refreshes the preview map. Coarse but
    // correct — previews are one bounded query.
    const channel = messagesService.subscribeAll((_message: Message) => {
      void refreshPreviews();
    });
    return () => messagesService.unsubscribe(channel);
  }, [refreshPreviews, chatIdsKey]);

  // Sort: chats with newest messages first; chats without messages fall
  // back to event creation order.
  const sorted = useMemo(() => {
    return [...chats].sort((a, b) => {
      const ta = previews.get(a.id)?.lastMessage?.created_at ?? a.created_at;
      const tb = previews.get(b.id)?.lastMessage?.created_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
  }, [chats, previews]);

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          Chats
        </Text>
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
          <EmptyState
            emoji="💬"
            title="No chats yet"
            description="Join an event on the map — every event comes with its own group chat."
            actionLabel="Open map"
            onAction={() => router.push('/(tabs)/map')}
          />
        }
      />
    </SafeAreaView>
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
