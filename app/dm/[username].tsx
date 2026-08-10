import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { PollComposerSheet } from '@/features/chat/PollComposerSheet';
import { PollResultsSheet } from '@/features/chat/PollResultsSheet';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { dmsService } from '@/services/dms.service';
import { friendshipsService, type FriendshipState } from '@/services/friendships.service';
import { pollsService } from '@/services/polls.service';
import { looksLikeUuid, profilesService } from '@/services/profiles.service';
import { useModerationStore } from '@/store/moderation.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { formatLastSeen, isOnline } from '@/utils/lastSeen';
import { goBack } from '@/utils/nav';
import type { MessageWithSender, PollDetails, Profile } from '@/types';

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** 1:1 direct message room. Same messaging features as event + group
 *  chats (replies, reactions, voice). The 1-message-per-side rule for
 *  non-friends lives on the server — the composer swaps for a lock
 *  strip once the cap is hit. */
export default function DmRoomScreen() {
  const t = useT();
  const { username: handleParam } = useLocalSearchParams<{ username: string }>();
  const handle = (handleParam ?? '').trim();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const moderationGuard = useModerationStore((s) => s.guard);
  const recorder = useVoiceRecorder();

  const [other, setOther] = useState<Profile | null>(null);
  const [dmId, setDmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [friendship, setFriendship] = useState<FriendshipState>('none');
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDetails, setPollDetails] = useState<Map<string, PollDetails>>(new Map());
  const [resultsTarget, setResultsTarget] = useState<MessageWithSender | null>(null);
  // Ticks so the "Online / last seen …" label re-derives as time passes,
  // and re-polls the other person's last_seen so it stays fresh.
  const [now, setNow] = useState(() => new Date());
  // iBlocked = I blocked them (→ Unblock bar); theyBlocked = they blocked
  // me (→ can't message). Loaded on open + refreshed on every realtime
  // change (the "you were blocked" system message triggers a refetch).
  const [block, setBlock] = useState({ iBlocked: false, theyBlocked: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const refetch = useCallback(async (id: string) => {
    setMessages(await dmsService.listMessages(id));
    void dmsService.markRead(id).catch(() => {});
  }, []);

  const loadBlockState = useCallback(async (otherId: string) => {
    try {
      setBlock(await dmsService.blockState(otherId));
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!handle || !viewerId) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await profilesService.getByHandle(handle);
        if (!profile) throw new Error(t('dm.userNotFound'));
        if (cancelled) return;
        setOther(profile);
        if (looksLikeUuid(handle) && profile.username !== handle) {
          router.replace({ pathname: '/dm/[username]', params: { username: profile.username } });
        }
        const [id, state] = await Promise.all([
          dmsService.ensureRoom(profile.id),
          friendshipsService.getState(viewerId, profile.id),
        ]);
        if (cancelled) return;
        setDmId(id);
        setFriendship(state);
        void loadBlockState(profile.id);
        await refetch(id);
      } catch (e) {
        if (!cancelled) toast.show(e instanceof Error ? e.message : t('dm.couldNotOpen'), 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, viewerId, toast, refetch, loadBlockState]);

  // Realtime — refetch messages + block state on any change (so the
  // "you were blocked" notice and the composer lock land live).
  useEffect(() => {
    if (!dmId || !other) return;
    const ch = dmsService.subscribe(dmId, () => {
      void refetch(dmId);
      void loadBlockState(other.id);
    });
    return () => dmsService.unsubscribe(ch);
  }, [dmId, other, refetch, loadBlockState]);

  // Presence: every 20s advance the clock (so "Online" ages into "last
  // seen …") and re-poll the other person's last_seen timestamp.
  useEffect(() => {
    const otherId = other?.id;
    if (!otherId) return;
    const id = setInterval(() => {
      setNow(new Date());
      void profilesService
        .getLastSeen(otherId)
        .then((ls) =>
          setOther((prev) =>
            prev && prev.id === otherId ? { ...prev, last_seen_at: ls } : prev,
          ),
        )
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
  }, [other?.id]);

  const visible = useMemo(() => {
    const rows = [...messages].reverse();
    // If they blocked me, hide their avatar on their message bubbles too
    // (the header + placeholder handle the rest).
    if (!block.theyBlocked) return rows;
    return rows.map((m) =>
      m.sender_id && m.sender_id !== viewerId && m.sender
        ? { ...m, sender: { ...m.sender, avatar_url: null } }
        : m,
    );
  }, [messages, block.theyBlocked, viewerId]);
  const byId = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const myCount = messages.filter((m) => m.sender_id === viewerId).length;
  const nonFriendBlocked = friendship !== 'friends' && myCount >= 1;

  // Re-fetch per-poll details (my choice + voter avatars) whenever a poll
  // appears or its tallies move — same live behaviour as event/group.
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

  const handleCreatePoll = useCallback(
    async (question: string, options: string[], anonymous: boolean) => {
      if (!dmId) return;
      await pollsService.createDmPoll(dmId, question, options, anonymous);
      await refetch(dmId);
    },
    [dmId, refetch],
  );

  const handleVotePoll = useCallback(
    async (message: MessageWithSender, optionId: string) => {
      if (!dmId) return;
      try {
        await pollsService.vote(message.id, optionId);
        await refetch(dmId);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('room.couldNotVote'), 'error');
      }
    },
    [dmId, refetch, toast],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!other || !dmId) return;
      if (!moderationGuard()) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await dmsService.sendText(other.id, text, replyTo);
      await refetch(dmId);
    },
    [other, dmId, replyingTo, refetch, moderationGuard],
  );

  const handleStartVoice = useCallback(async () => {
    if (!moderationGuard()) return;
    try {
      await recorder.start();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotRecord'), 'error');
    }
  }, [recorder, toast, moderationGuard]);

  const handleFinishVoice = useCallback(async () => {
    if (!other || !dmId || !viewerId) return;
    try {
      const rec = await recorder.finish();
      if (!rec) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await dmsService.sendVoice(other.id, dmId, viewerId, rec.uri, rec.durationMs, rec.waveform, replyTo);
      await refetch(dmId);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotSendVoice'), 'error');
    }
  }, [other, dmId, viewerId, recorder, replyingTo, refetch, toast]);

  const handleToggleReaction = useCallback(
    async (message: MessageWithSender, emoji: string) => {
      if (!dmId) return;
      try {
        await dmsService.toggleReaction(message.id, emoji);
        await refetch(dmId);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('room.couldNotReact'), 'error');
      }
    },
    [dmId, refetch, toast],
  );

  const handleAddFriend = useCallback(async () => {
    if (!other || !viewerId) return;
    try {
      await friendshipsService.request(other.id);
      setFriendship(await friendshipsService.getState(viewerId, other.id));
      toast.show(
        friendship === 'incoming' ? t('dm.friendsNow') : t('dm.requestSent'),
        'success',
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('dm.couldNotSendRequest'), 'error');
    }
  }, [other, viewerId, friendship, toast]);

  const handleBlock = useCallback(async () => {
    if (!other || !dmId) return;
    setConfirmBlock(false);
    try {
      await dmsService.block(other.id);
      setBlock((s) => ({ ...s, iBlocked: true }));
      setFriendship('none'); // block removes the friendship both ways
      await refetch(dmId);
      toast.show(`${other.display_name} blocked.`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('dm.couldNotBlock'), 'error');
    }
  }, [other, dmId, refetch, toast]);

  const handleUnblock = useCallback(async () => {
    if (!other || !dmId) return;
    setMenuOpen(false);
    try {
      await dmsService.unblock(other.id);
      setBlock((s) => ({ ...s, iBlocked: false }));
      await refetch(dmId);
      toast.show(t('dm.unblocked'), 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('dm.couldNotUnblock'), 'error');
    }
  }, [other, dmId, refetch, toast]);

  if (!other) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState emoji="💬" title={t('room.loadingDm')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
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
          onPress={() =>
            router.navigate({ pathname: '/user/[username]', params: { username: other.username } })
          }
          className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <Avatar
            name={other.display_name}
            uri={block.theyBlocked ? null : other.avatar_url}
            size="sm"
          />
          <View className="flex-1">
            <View className="flex-row items-center gap-1">
              <Text
                className="shrink text-[15px] font-bold text-text-light dark:text-text-dark"
                numberOfLines={1}
              >
                {other.display_name}
              </Text>
              <VerifiedBadge role={other.role} size={13} />
            </View>
            <Text
              className={[
                'text-xs',
                !block.theyBlocked && isOnline(other.last_seen_at, now)
                  ? 'font-semibold text-green-500'
                  : 'text-muted-light',
              ].join(' ')}
              numberOfLines={1}
            >
              {block.theyBlocked
                ? t('presence.longAgo')
                : formatLastSeen(other.last_seen_at, now)}
            </Text>
          </View>
        </Pressable>
        {friendship !== 'friends' && !block.iBlocked && !block.theyBlocked ? (
          <Pressable
            onPress={handleAddFriend}
            className="rounded-full bg-brand-500 px-3 py-1.5"
            accessibilityLabel={friendship === 'incoming' ? t('dm.acceptRequest') : t('dm.sendRequest')}
          >
            <Text className="text-xs font-semibold text-white">
              {friendship === 'incoming'
                ? t('dm.accept')
                : friendship === 'outgoing'
                  ? t('dm.requested')
                  : t('dm.addFriend')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityLabel={t('dm.moreOptions')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="ellipsis-vertical" size={17} color={iconColor} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          inverted
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
                  pollDetails={pollDetails.get(item.id) ?? null}
                  onLongPress={(m) => setActionTarget(m)}
                  onContextMenu={(m) => setActionTarget(m)}
                  onReply={(m) => setReplyingTo(m)}
                  onToggleReaction={handleToggleReaction}
                  onVotePoll={handleVotePoll}
                  onViewResults={(m) => setResultsTarget(m)}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <EmptyState
                emoji="👋"
                title={t('room.sayHi')}
                description={
                  friendship === 'friends'
                    ? "You're friends — chat away."
                    : "You aren't friends yet — you can send one message. Adding each other as friends unlocks the rest."
                }
              />
            </View>
          }
        />

        <View style={{ paddingBottom: insets.bottom }}>
          {block.iBlocked ? (
            // I blocked them — Telegram-style Unblock bar in place of the
            // composer. Unblocking restores messaging.
            <Pressable
              onPress={handleUnblock}
              className="flex-row items-center justify-center gap-2 border-t border-border-light bg-panel-light py-4 dark:border-border-dark dark:bg-panel-dark active:opacity-70"
            >
              <Ionicons name="lock-open-outline" size={16} color="#B91C1C" />
              <Text className="text-[15px] font-bold uppercase tracking-wide text-red-600">
                {t('dm.unblock')}
              </Text>
            </Pressable>
          ) : block.theyBlocked ? (
            <View className="flex-row items-center justify-center gap-2 border-t border-border-light bg-panel-light py-4 dark:border-border-dark dark:bg-panel-dark">
              <Ionicons name="ban" size={14} color="#8B8880" />
              <Text className="text-xs text-muted-light">
                {t('dm.cannotMessage')}
              </Text>
            </View>
          ) : nonFriendBlocked ? (
            <View className="flex-row items-center gap-2 border-t border-border-light bg-panel-light px-4 py-3 dark:border-border-dark dark:bg-panel-dark">
              <Ionicons name="lock-closed" size={14} color="#8B8880" />
              <Text className="flex-1 text-xs text-muted-light">
                Add {other.display_name} as a friend to send more messages.
              </Text>
              <Pressable onPress={handleAddFriend} className="rounded-full bg-brand-500 px-3 py-1.5">
                <Text className="text-xs font-semibold text-white">
                  {friendship === 'incoming' ? t('dm.accept') : t('dm.addFriend')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <MessageInput
              onSend={handleSend}
              onAttach={() => toast.show(t('room.attachSoon'), 'info')}
              onCreatePoll={() => setPollOpen(true)}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              recording={recorder.state === 'recording'}
              recordingMs={recorder.elapsedMs}
              onStartVoice={handleStartVoice}
              onFinishVoice={handleFinishVoice}
              onCancelVoice={() => void recorder.cancel()}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Overflow menu: block / unblock */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} autoHeight>
        <View className="gap-2 pb-2">
          {block.iBlocked ? (
            <PrimaryButton
              label={t('dm.unblockUser', { name: other.display_name })}
              variant="secondary"
              leftIcon={<Ionicons name="lock-open-outline" size={14} color="#4B5FE0" />}
              onPress={handleUnblock}
              fullWidth
            />
          ) : (
            <PrimaryButton
              label={t('dm.blockUser', { name: other.display_name })}
              variant="destructive-outline"
              leftIcon={<Ionicons name="ban" size={14} color="#B91C1C" />}
              onPress={() => {
                setMenuOpen(false);
                setConfirmBlock(true);
              }}
              fullWidth
            />
          )}
        </View>
      </BottomSheet>

      <ConfirmationDialog
        open={confirmBlock}
        title={t('dm.blockTitle', { name: other.display_name })}
        message={t('dm.blockMessage')}
        confirmLabel={t('dm.blockConfirm')}
        destructive
        onConfirm={handleBlock}
        onCancel={() => setConfirmBlock(false)}
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

      {/* Message actions: reactions + reply */}
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
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
