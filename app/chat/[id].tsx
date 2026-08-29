import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { JumpToLatest } from '@/components/chat/JumpToLatest';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { UnreadDivider } from '@/components/chat/UnreadDivider';
import { MessageSearchSheet } from '@/features/chat/MessageSearchSheet';
import { useRoomExtras } from '@/hooks/useRoomExtras';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { DirectionsSheet } from '@/features/events/DirectionsSheet';
import { EventPreviewBody } from '@/features/events/EventPreviewBody';
import { MembersSheet } from '@/features/chat/MembersSheet';
import { PollComposerSheet } from '@/features/chat/PollComposerSheet';
import { PollResultsSheet } from '@/features/chat/PollResultsSheet';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { useVenue } from '@/hooks/useVenue';
import { messagesService } from '@/services/messages.service';
import { pollsService } from '@/services/polls.service';
import { useEventsStore } from '@/store/events.store';
import { useModerationStore } from '@/store/moderation.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { formatEventDate, formatEventTime } from '@/utils/format';
import { goBack } from '@/utils/nav';
import type { EventWithCreator, MessageWithSender, PollDetails } from '@/types';

/** Quick-reaction palette — must match the whitelist in the
 *  toggle_reaction RPC. */
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** Chat room for one event. The chat id IS the event id. */
export default function ChatRoomScreen() {
  const t = useT();
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const viewerId = session?.user.id ?? null;
  const { coords } = useLocation();
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const moderationGuard = useModerationStore((s) => s.guard);

  const event = useEventsStore((s) => s.events.find((e) => e.id === eventId)) ?? null;
  const venue = useVenue(event);
  const { messages, status, refetch } = useChat(eventId ?? null, viewerId);
  const recorder = useVoiceRecorder();
  const listRef = useRef<FlatList<MessageWithSender> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [eventOpen, setEventOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDetails, setPollDetails] = useState<Map<string, PollDetails>>(new Map());
  const [resultsTarget, setResultsTarget] = useState<MessageWithSender | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<EventWithCreator | null>(null);

  const isHost = !!(event && viewerId && event.creator_id === viewerId);

  // Inverted FlatList wants newest-first; also drop soft-deleted rows.
  const visible = useMemo(() => {
    if (!viewerId) return [];
    return messages.filter((m) => !m.deleted_for.includes(viewerId)).reverse();
  }, [messages, viewerId]);

  const extras = useRoomExtras({
    scope: 'event',
    targetId: eventId ?? null,
    viewerId,
    displayName: profile?.display_name ?? '',
    messages,
    listRef,
  });

  // Resolve reply quotes from the loaded window — no extra fetches.
  const byId = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Signature that changes whenever a poll appears or its tallies move
  // (realtime delivers vote UPDATEs). Re-fetch the per-poll details — my
  // choice + voter avatars — off that so they stay in sync live.
  const pollSig = useMemo(
    () =>
      messages
        .filter((m) => m.type === 'poll')
        .map((m) => `${m.id}:${(m.poll?.options ?? []).map((o) => o.votes).join('-')}`)
        .join('|'),
    [messages],
  );
  useEffect(() => {
    const ids = messages.filter((m) => m.type === 'poll').map((m) => m.id);
    if (ids.length === 0) {
      setPollDetails(new Map());
      return;
    }
    let cancelled = false;
    pollsService
      .details(ids)
      .then((d) => {
        if (!cancelled) setPollDetails(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollSig]);

  const handleCreatePoll = async (
    question: string,
    options: string[],
    anonymous: boolean,
  ) => {
    if (!eventId) return;
    await pollsService.createEventPoll(eventId, question, options, anonymous);
  };

  const handleVotePoll = async (message: MessageWithSender, optionId: string) => {
    try {
      await pollsService.vote(message.id, optionId);
      // Immediate refresh for parity with group/DM (realtime also
      // delivers the update, this just makes the tap feel instant).
      await refetch();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotVote'), 'error');
    }
  };

  const handleSend = async (text: string) => {
    if (!eventId || !viewerId) return;
    // Muted/banned → explain why instead of letting the insert fail.
    if (!moderationGuard()) return;
    const replyTo = replyingTo?.id ?? null;
    setReplyingTo(null);
    await messagesService.sendText(eventId, viewerId, text, replyTo);
  };

  const handleStartVoice = async () => {
    if (!moderationGuard()) return;
    try {
      await recorder.start();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotRecord'), 'error');
    }
  };

  const handleFinishVoice = async () => {
    if (!eventId || !viewerId) return;
    try {
      const rec = await recorder.finish();
      if (!rec) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await messagesService.sendVoice(
        eventId,
        viewerId,
        rec.uri,
        rec.durationMs,
        replyTo,
        rec.waveform,
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotSendVoice'), 'error');
    }
  };

  const handleToggleReaction = async (message: MessageWithSender, emoji: string) => {
    try {
      await messagesService.toggleReaction(message.id, emoji);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotReact'), 'error');
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
        () => toast.show(t('room.copied'), 'success'),
        () => toast.show(t('room.couldNotCopy'), 'error'),
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
      toast.show(e instanceof Error ? e.message : t('room.couldNotDelete'), 'error');
    }
  };

  const handleHide = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionTarget(null);
    try {
      await messagesService.hide(target.id);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotRemove'), 'error');
    }
  };

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="💬"
          title={t('room.notFound')}
          description={t('room.notFoundHint')}
          actionLabel={t('room.backToChats')}
          onAction={() => goBack('/(tabs)/chat')}
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
          onPress={() => goBack('/(tabs)/chat')}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>

        <Pressable
          onPress={() => setEventOpen(true)}
          accessibilityLabel={t('room.eventDetails')}
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
          onPress={() => setSearchOpen(true)}
          accessibilityLabel={t('room.search')}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="search" size={16} color={iconColor} />
        </Pressable>

        {/* Mute lives in the header, not behind the event sheet: it is
            the thing you reach for while the chat is being noisy, which
            is precisely when you do not want to go hunting. */}
        <Pressable
          onPress={() => {
            void extras
              .toggleMute()
              .then((next) =>
                toast.show(t(next ? 'chat.mutedToast' : 'chat.unmutedToast'), 'success'),
              )
              .catch(() => toast.show(t('chat.muteFailed'), 'error'));
          }}
          accessibilityLabel={t(extras.muted ? 'chat.unmute' : 'chat.mute')}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons
            name={extras.muted ? 'notifications-off' : 'notifications-outline'}
            size={16}
            color={extras.muted ? '#FE5800' : iconColor}
          />
        </Pressable>

        <Pressable
          onPress={() => setMembersOpen(true)}
          accessibilityLabel={t('room.members')}
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
          ref={listRef}
          data={visible}
          inverted
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          onScroll={extras.onScroll}
          scrollEventThrottle={64}
          // Inverted, so the list's header renders at the BOTTOM — which
          // is exactly where a typing line belongs, just above the
          // newest message and below nothing.
          ListHeaderComponent={<TypingIndicator names={extras.typerNames} />}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item, index }) => {
            const older = visible[index + 1];
            const showDate = !older || dayKey(older.created_at) !== dayKey(item.created_at);
            return (
              <View>
                {showDate ? <DateSeparator iso={item.created_at} /> : null}
                {item.id === extras.firstUnreadId ? (
                  <UnreadDivider count={extras.unreadCount} />
                ) : null}
                <MessageBubble
                  message={item}
                  isOwn={item.sender_id === viewerId}
                  repliedTo={item.reply_to ? (byId.get(item.reply_to) ?? null) : null}
                  viewerId={viewerId}
                  favoriteReaction={favoriteReaction}
                  pollDetails={pollDetails.get(item.id) ?? null}
                  onLongPress={(m) => setActionTarget(m)}
                  onContextMenu={(m) => setActionTarget(m)}
                  onReply={(m) => setReplyingTo(m)}
                  onPressAvatar={(sender) =>
                    router.navigate({ pathname: '/user/[username]', params: { username: sender.username } })
                  }
                  onToggleReaction={handleToggleReaction}
                  onVotePoll={handleVotePoll}
                  onViewResults={(m) => setResultsTarget(m)}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            status === 'ready' ? (
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  emoji="👋"
                  title={t('room.sayHi')}
                  description={t('room.sayHiHint')}
                />
              </View>
            ) : null
          }
        />

        {/* Sits over the list, clear of the composer. */}
        <JumpToLatest
          visible={extras.showJump}
          count={extras.missedCount}
          onPress={extras.jumpToLatest}
          bottom={insets.bottom + 70}
        />

        {/* Composer sits above the home indicator: SafeAreaView only
            covers the top edge (the keyboard needs to butt straight up
            against the input), so fold the bottom inset in here. */}
        <View style={{ paddingBottom: insets.bottom }}>
          <MessageInput
            onTyping={extras.notifyTyping}
            onSend={handleSend}
            onAttach={() =>
              toast.show(t('room.attachSoon'), 'info')
            }
            onCreatePoll={() => setPollOpen(true)}
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

      <MessageSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        search={(q) => messagesService.search(eventId!, q)}
        onPick={(m) => {
          setSearchOpen(false);
          // Reveal it if it is in the loaded window; otherwise the sheet
          // has at least shown the text, which is most of what someone
          // searching for it wanted.
          const i = visible.findIndex((x) => x.id === m.id);
          if (i >= 0) listRef.current?.scrollToIndex({ index: i, animated: true });
        }}
      />

      {/* Pinned event expanded — full details incl. venue text.
          Directions opens the same maps-app chooser the map uses. */}
      {/* 0.85 cap matches EventPreviewSheet — room for poster + expanded
          description without clipping the buttons. */}
      <BottomSheet open={eventOpen} onClose={() => setEventOpen(false)} heightPct={0.85} autoHeight>
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
              router.navigate({ pathname: '/user/[username]', params: { username: e.creator.username } });
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

      <PollComposerSheet
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={handleCreatePoll}
      />

      <PollResultsSheet
        open={!!resultsTarget}
        onClose={() => setResultsTarget(null)}
        poll={resultsTarget?.poll ?? null}
        details={resultsTarget ? (pollDetails.get(resultsTarget.id) ?? null) : null}
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
                accessibilityLabel={t('room.react', { emoji })}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            label={t('room.reply')}
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
              label={t('room.copyText')}
              variant="secondary"
              leftIcon={<Ionicons name="copy-outline" size={14} color="#4B5FE0" />}
              onPress={handleCopyText}
              fullWidth
            />
          ) : null}
          <PrimaryButton
            label={t('room.deleteForMe')}
            variant="secondary"
            onPress={handleDeleteForMe}
            fullWidth
          />
          {isHost && actionTarget && !actionTarget.hidden ? (
            <PrimaryButton
              label={t('room.removeForEveryone')}
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
