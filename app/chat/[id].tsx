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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { DirectionsSheet } from '@/features/events/DirectionsSheet';
import { EventPreviewBody } from '@/features/events/EventPreviewBody';
import { MembersSheet } from '@/features/chat/MembersSheet';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { useVenue } from '@/hooks/useVenue';
import { messagesService } from '@/services/messages.service';
import { useEventsStore } from '@/store/events.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, MessageWithSender } from '@/types';

/** Quick-reaction palette — must match the whitelist in the
 *  toggle_reaction RPC. */
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** Chat room for one event. The chat id IS the event id. */
export default function ChatRoomScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const { coords } = useLocation();
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);

  const event = useEventsStore((s) => s.events.find((e) => e.id === eventId)) ?? null;
  const venue = useVenue(event);
  const { messages, status } = useChat(eventId ?? null, viewerId);
  const recorder = useVoiceRecorder();

  const [eventOpen, setEventOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<EventWithCreator | null>(null);

  const isHost = !!(event && viewerId && event.creator_id === viewerId);

  // Inverted FlatList wants newest-first; also drop soft-deleted rows.
  const visible = useMemo(() => {
    if (!viewerId) return [];
    return messages.filter((m) => !m.deleted_for.includes(viewerId)).reverse();
  }, [messages, viewerId]);

  // Resolve reply quotes from the loaded window — no extra fetches.
  const byId = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!eventId || !viewerId) return;
    const replyTo = replyingTo?.id ?? null;
    setReplyingTo(null);
    await messagesService.sendText(eventId, viewerId, text, replyTo);
  };

  const handleStartVoice = async () => {
    try {
      await recorder.start();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not start recording', 'error');
    }
  };

  const handleFinishVoice = async () => {
    if (!eventId || !viewerId) return;
    try {
      const rec = await recorder.finish();
      if (!rec) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await messagesService.sendVoice(eventId, viewerId, rec.uri, rec.durationMs, replyTo);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not send voice message', 'error');
    }
  };

  const handleToggleReaction = async (message: MessageWithSender, emoji: string) => {
    try {
      await messagesService.toggleReaction(message.id, emoji);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not react', 'error');
    }
  };

  const handleCopyText = () => {
    const target = actionTarget;
    setActionTarget(null);
    if (!target?.text) return;
    // Clipboard is a web-only affordance for now — expo-clipboard would
    // need a fresh native build; the context menu is a web feature
    // anyway.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      void navigator.clipboard?.writeText(target.text).then(
        () => toast.show('Copied.', 'success'),
        () => toast.show('Could not copy', 'error'),
      );
    }
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
      {/* Single merged header: back · emoji · title/meta/venue · members.
          The event block is tappable (chevron hints at the detail
          sheet); the members icon sits beside it. No duplicate title. */}
      <View className="flex-row items-center gap-2.5 border-b border-border-light px-3 py-2 dark:border-border-dark">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>

        <Pressable
          onPress={() => setEventOpen(true)}
          accessibilityLabel="Event details"
          className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
            <Text style={{ fontSize: 20 }}>{event.emoji}</Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-[15px] font-bold text-text-light dark:text-text-dark"
              numberOfLines={1}
            >
              {event.title}
            </Text>
            <Text
              className="font-mono text-[9px] uppercase tracking-wider text-muted-light"
              numberOfLines={1}
            >
              {formatEventDate(event.event_date)} · {formatEventTime(event.event_time)} ·{' '}
              {event.participant_count} going
              {event.max_participants ? ` / ${event.max_participants}` : ''}
            </Text>
            {venue ? (
              <View className="flex-row items-center gap-1">
                <Ionicons name="location" size={9} color="#4B5FE0" />
                <Text
                  className="flex-1 text-[11px] font-medium text-brand-500"
                  numberOfLines={1}
                >
                  {venue}
                </Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={14} color="#8B8880" />
        </Pressable>

        <Pressable
          onPress={() => setMembersOpen(true)}
          accessibilityLabel="Members"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="people-outline" size={17} color={iconColor} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          data={visible}
          inverted
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item, index }) => {
            const older = visible[index + 1];
            const showDate = !older || dayKey(older.created_at) !== dayKey(item.created_at);
            return (
              <View>
                {showDate ? <DateSeparator iso={item.created_at} /> : null}
                <MessageBubble
                  message={item}
                  isOwn={item.sender_id === viewerId}
                  repliedTo={item.reply_to ? (byId.get(item.reply_to) ?? null) : null}
                  viewerId={viewerId}
                  favoriteReaction={favoriteReaction}
                  onLongPress={(m) => setActionTarget(m)}
                  onContextMenu={(m) => setActionTarget(m)}
                  onReply={(m) => setReplyingTo(m)}
                  onPressAvatar={(userId) =>
                    router.push({ pathname: '/user/[id]', params: { id: userId } })
                  }
                  onToggleReaction={handleToggleReaction}
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

        {/* Composer sits above the home indicator: SafeAreaView only
            covers the top edge (the keyboard needs to butt straight up
            against the input), so fold the bottom inset in here. */}
        <View style={{ paddingBottom: insets.bottom }}>
          <MessageInput
            onSend={handleSend}
            onAttach={() =>
              toast.show('Photos and video land next update.', 'info')
            }
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            recording={recorder.state === 'recording'}
            recordingMs={recorder.elapsedMs}
            onStartVoice={handleStartVoice}
            onFinishVoice={handleFinishVoice}
            onCancelVoice={() => void recorder.cancel()}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Pinned event expanded — full details incl. venue text.
          Directions opens the same maps-app chooser the map uses. */}
      <BottomSheet open={eventOpen} onClose={() => setEventOpen(false)} heightPct={0.7} autoHeight>
        {event ? (
          <EventPreviewBody
            event={event}
            viewerLocation={coords}
            onDirections={(e) => {
              setEventOpen(false);
              setDirectionsTarget(e);
            }}
            onViewHost={(e) => {
              setEventOpen(false);
              router.push({ pathname: '/user/[id]', params: { id: e.creator_id } });
            }}
          />
        ) : null}
      </BottomSheet>

      <DirectionsSheet
        event={directionsTarget}
        onClose={() => setDirectionsTarget(null)}
      />

      <MembersSheet
        event={event}
        open={membersOpen}
        viewerId={viewerId}
        onClose={() => setMembersOpen(false)}
      />

      {/* Message actions: quick reactions + reply + copy + deletes.
          Opened by long-press everywhere and right-click on web. */}
      <BottomSheet open={!!actionTarget} onClose={() => setActionTarget(null)} autoHeight>
        <View className="gap-3 pb-2">
          <View className="flex-row justify-between px-1">
            {REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  const target = actionTarget;
                  setActionTarget(null);
                  if (target) void handleToggleReaction(target, emoji);
                }}
                className="h-11 w-11 items-center justify-center rounded-full bg-elevated-light active:opacity-70 dark:bg-elevated-dark"
                accessibilityLabel={`React ${emoji}`}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            label="Reply"
            variant="secondary"
            leftIcon={<Ionicons name="arrow-undo-outline" size={14} color="#4B5FE0" />}
            onPress={() => {
              setReplyingTo(actionTarget);
              setActionTarget(null);
            }}
            fullWidth
          />
          {Platform.OS === 'web' && actionTarget?.type === 'text' ? (
            <PrimaryButton
              label="Copy text"
              variant="secondary"
              leftIcon={<Ionicons name="copy-outline" size={14} color="#4B5FE0" />}
              onPress={handleCopyText}
              fullWidth
            />
          ) : null}
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
