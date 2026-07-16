import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { PinnedEventBanner } from '@/components/chat/PinnedEventBanner';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { EventPreviewBody } from '@/features/events/EventPreviewBody';
import { MembersSheet } from '@/features/chat/MembersSheet';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { messagesService } from '@/services/messages.service';
import { useEventsStore } from '@/store/events.store';
import type { MessageWithSender } from '@/types';

/** Chat room for one event. The chat id IS the event id. */
export default function ChatRoomScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const { coords } = useLocation();

  const event = useEventsStore((s) => s.events.find((e) => e.id === eventId)) ?? null;
  const { messages, status } = useChat(eventId ?? null, viewerId);

  const [eventOpen, setEventOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);

  const isHost = !!(event && viewerId && event.creator_id === viewerId);

  // Inverted FlatList wants newest-first; also drop soft-deleted rows.
  const visible = useMemo(() => {
    if (!viewerId) return [];
    return messages.filter((m) => !m.deleted_for.includes(viewerId)).reverse();
  }, [messages, viewerId]);

  // The viewer's newest own message — the only bubble that renders a
  // read receipt, mirroring the mock's single "READ" row.
  const lastOwnReadId = useMemo(() => {
    if (!viewerId) return null;
    const lastOwn = visible.find((m) => m.sender_id === viewerId && !m.hidden);
    return lastOwn && lastOwn.read_by.length > 0 ? lastOwn.id : null;
  }, [visible, viewerId]);

  const handleSend = async (text: string) => {
    if (!eventId || !viewerId) return;
    await messagesService.sendText(eventId, viewerId, text);
  };

  const handleDeleteForMe = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionTarget(null);
    try {
      await messagesService.deleteForMe(target.id);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not delete', 'error');
    }
  };

  const handleHide = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionTarget(null);
    try {
      await messagesService.hide(target.id);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not remove', 'error');
    }
  };

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="💬"
          title="Chat not found"
          description="This event may have ended or been deleted."
          actionLabel="Back to chats"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border-light px-4 py-2.5 dark:border-border-dark">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <View className="flex-1">
          <Text
            className="text-base font-bold text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {event.title}
          </Text>
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {event.participant_count} going
            {isHost ? ' · you host' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => setMembersOpen(true)}
          accessibilityLabel="Members"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="people-outline" size={17} color={iconColor} />
        </Pressable>
      </View>

      <PinnedEventBanner event={event} onPress={() => setEventOpen(true)} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          data={visible}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item, index }) => {
            // Inverted list: index+1 is the OLDER neighbour. Render a
            // date header above this bubble when the day changes.
            const older = visible[index + 1];
            const showDate = !older || dayKey(older.created_at) !== dayKey(item.created_at);
            return (
              <View>
                {showDate ? <DateSeparator iso={item.created_at} /> : null}
                <MessageBubble
                  message={item}
                  isOwn={item.sender_id === viewerId}
                  showReadReceipt={item.id === lastOwnReadId}
                  onLongPress={(m) => {
                    if (m.sender_id === viewerId || isHost) setActionTarget(m);
                  }}
                  onPressAvatar={(userId) =>
                    router.push({ pathname: '/user/[id]', params: { id: userId } })
                  }
                />
              </View>
            );
          }}
          ListEmptyComponent={
            status === 'ready' ? (
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  emoji="👋"
                  title="Say hi"
                  description="You're in — start the conversation."
                />
              </View>
            ) : null
          }
        />

        <MessageInput
          onSend={handleSend}
          onAttach={() =>
            toast.show('Photos, video and location sharing land next update.', 'info')
          }
        />
      </KeyboardAvoidingView>

      {/* Pinned banner expanded — full event details, same body as the
          map peek (join/leave/directions/host actions all work). */}
      <BottomSheet open={eventOpen} onClose={() => setEventOpen(false)} heightPct={0.7} autoHeight>
        {event ? (
          <EventPreviewBody
            event={event}
            viewerLocation={coords}
            onDirections={() => setEventOpen(false)}
            onViewHost={(e) => {
              setEventOpen(false);
              router.push({ pathname: '/user/[id]', params: { id: e.creator_id } });
            }}
          />
        ) : null}
      </BottomSheet>

      <MembersSheet
        event={event}
        open={membersOpen}
        viewerId={viewerId}
        onClose={() => setMembersOpen(false)}
      />

      {/* Long-press actions */}
      <BottomSheet open={!!actionTarget} onClose={() => setActionTarget(null)} autoHeight>
        <View className="gap-2 pb-2">
          <Text className="text-base font-bold text-text-light dark:text-text-dark">
            Message options
          </Text>
          <PrimaryButton
            label="Delete for me"
            variant="secondary"
            onPress={handleDeleteForMe}
            fullWidth
          />
          {isHost && actionTarget && !actionTarget.hidden ? (
            <PrimaryButton
              label="Remove for everyone"
              variant="destructive-outline"
              onPress={handleHide}
              fullWidth
            />
          ) : null}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
