import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FloatingDate } from '@/components/chat/FloatingDate';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { JumpToLatest } from '@/components/chat/JumpToLatest';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { UnreadDivider } from '@/components/chat/UnreadDivider';
import { MessageSearchSheet } from '@/features/chat/MessageSearchSheet';
import { useRoomExtras } from '@/hooks/useRoomExtras';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { useToast } from '@/components/ui/Toast';
import { AddGroupMembersSheet } from '@/features/chat/AddGroupMembersSheet';
import { PollComposerSheet } from '@/features/chat/PollComposerSheet';
import { PollResultsSheet } from '@/features/chat/PollResultsSheet';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { groupsService, type GroupMember } from '@/services/groups.service';
import { invitesService } from '@/services/invites.service';
import { pollsService } from '@/services/polls.service';
import { useModerationStore } from '@/store/moderation.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { goBack } from '@/utils/nav';
import type { MessageWithSender, PollDetails } from '@/types';

/** Quick-reaction palette — matches the toggle_group_reaction whitelist. */
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** Standalone group chat room (not tied to an event). Same messaging
 *  features as event chats — replies, reactions, voice — reusing the
 *  shared MessageBubble + MessageInput. */
export default function GroupRoomScreen() {
  const t = useT();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const viewerId = session?.user.id ?? null;
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const moderationGuard = useModerationStore((s) => s.guard);
  const recorder = useVoiceRecorder();
  const listRef = useRef<FlatList<MessageWithSender> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [group, setGroup] = useState<
    { id: string; name: string; emoji: string; creator_id: string } | null
  >(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDetails, setPollDetails] = useState<Map<string, PollDetails>>(new Map());
  const [resultsTarget, setResultsTarget] = useState<MessageWithSender | null>(null);
  const [pendingRemove, setPendingRemove] = useState<GroupMember | null>(null);

  const isCreator = !!group && group.creator_id === viewerId;

  const refetch = useCallback(async () => {
    if (!groupId) return;
    const msgs = await groupsService.listMessages(groupId);
    setMessages(msgs);
    void groupsService.markRead(groupId).catch(() => {});
  }, [groupId]);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const [g, msgs, mem] = await Promise.all([
        groupsService.getById(groupId),
        groupsService.listMessages(groupId),
        groupsService.listMembers(groupId),
      ]);
      setGroup(g);
      setMessages(msgs);
      setMembers(mem);
      void groupsService.markRead(groupId).catch(() => {});
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('group.couldNotOpen'), 'error');
    }
  }, [groupId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime — refetch on any change (new message, reaction, read receipt).
  useEffect(() => {
    if (!groupId || !viewerId) return;
    const ch = groupsService.subscribe(groupId, () => void refetch());
    return () => groupsService.unsubscribe(ch);
  }, [groupId, viewerId, refetch]);

  const visible = useMemo(() => {
    if (!viewerId) return [];
    return messages.filter((m) => !m.deleted_for.includes(viewerId)).reverse();
  }, [messages, viewerId]);

  // Resolve reply quotes from the loaded window.
  const byId = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Re-fetch per-poll details (my choice + voter avatars) whenever a poll
  // appears or its tallies move (realtime delivers the vote UPDATEs).
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
      if (!groupId) return;
      await pollsService.createGroupPoll(groupId, question, options, anonymous);
      await refetch();
    },
    [groupId, refetch],
  );

  const handleVotePoll = useCallback(
    async (message: MessageWithSender, optionId: string) => {
      try {
        await pollsService.vote(message.id, optionId);
        await refetch();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('room.couldNotVote'), 'error');
      }
    },
    [refetch, toast],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!groupId) return;
      if (!moderationGuard()) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await groupsService.send(groupId, text, replyTo);
      await refetch();
    },
    [groupId, replyingTo, refetch, moderationGuard],
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
    if (!groupId || !viewerId) return;
    try {
      const rec = await recorder.finish();
      if (!rec) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await groupsService.sendVoice(groupId, viewerId, rec.uri, rec.durationMs, rec.waveform, replyTo);
      await refetch();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotSendVoice'), 'error');
    }
  }, [groupId, viewerId, recorder, replyingTo, refetch, toast]);

  const handleToggleReaction = useCallback(
    async (message: MessageWithSender, emoji: string) => {
      try {
        await groupsService.toggleReaction(message.id, emoji);
        await refetch();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('room.couldNotReact'), 'error');
      }
    },
    [refetch, toast],
  );

  const refetchMembers = useCallback(async () => {
    if (!groupId) return;
    try {
      setMembers(await groupsService.listMembers(groupId));
    } catch {
      /* keep the current list on a transient error */
    }
  }, [groupId]);

  // Mint a fresh 24h link, then open the share sheet (Telegram / WhatsApp
  // / Viber / Copy). Opening the sheet first with a null url shows the
  // "Creating link…" state so the tap feels instant.
  const handleShare = useCallback(async () => {
    if (!groupId) return;
    setShareUrl(null);
    setShareOpen(true);
    try {
      const token = await groupsService.createInvite(groupId);
      setShareUrl(invitesService.groupShareUrl(token));
    } catch (e) {
      setShareOpen(false);
      toast.show(e instanceof Error ? e.message : t('group.couldNotCreateLink'), 'error');
    }
  }, [groupId, toast]);

  const handleRemoveMember = useCallback(async () => {
    if (!groupId || !pendingRemove) return;
    const target = pendingRemove;
    setPendingRemove(null);
    try {
      await groupsService.removeMember(groupId, target.id);
      setMembers((prev) => prev.filter((m) => m.id !== target.id));
      toast.show(`${target.display_name} removed.`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('room.couldNotRemove'), 'error');
    }
  }, [groupId, pendingRemove, toast]);

  const handleLeave = useCallback(async () => {
    if (!groupId) return;
    setConfirmLeave(false);
    try {
      await groupsService.leave(groupId);
      toast.show(t('group.left'), 'success');
      goBack('/(tabs)/chat');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('group.couldNotLeave'), 'error');
    }
  }, [groupId, toast]);

  const extras = useRoomExtras({
    scope: 'group',
    targetId: groupId ?? null,
    viewerId,
    displayName: profile?.display_name ?? '',
    messages,
    listRef,
  });

  if (!group) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState emoji="💬" title={t('room.loadingGroup')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header — back · emoji/name/count · share */}
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
          onPress={() => setDetailsOpen(true)}
          className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
            <Text style={{ fontSize: 20 }}>{group.emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-text-light dark:text-text-dark" numberOfLines={1}>
              {group.name}
            </Text>
            <Text className="text-xs text-muted-light" numberOfLines={1}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </Text>
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
          onPress={handleShare}
          accessibilityLabel={t('group.shareInvite')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="share-social-outline" size={17} color={iconColor} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <FlatList
          ref={listRef}
          data={visible}
          inverted
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          onScroll={extras.onScroll}
          scrollEventThrottle={64}
          onViewableItemsChanged={extras.onViewableItemsChanged}
          viewabilityConfig={extras.viewabilityConfig}
          ListHeaderComponent={<TypingIndicator names={extras.typerNames} />}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => {
            return (
              <View>
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
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <EmptyState
                emoji="👋"
                title={t('room.sayHi')}
                description={t('room.sayHiGroupHint')}
              />
            </View>
          }
        />

        <FloatingDate iso={extras.dateIso} visible={extras.dateVisible} top={8} />

        <JumpToLatest
          visible={extras.showJump}
          count={extras.missedCount}
          onPress={extras.jumpToLatest}
          bottom={insets.bottom + 70}
        />

        <View style={{ paddingBottom: insets.bottom }}>
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
        </View>
      </KeyboardAvoidingView>

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

      {/* Details sheet — members, share, leave */}
      <BottomSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} autoHeight>
        <View className="gap-3 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {group.emoji} {group.name}
          </Text>
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
          <View className="gap-2">
            {members.map((m) => {
              const memberIsCreator = m.id === group.creator_id;
              return (
                <View key={m.id} className="flex-row items-center gap-3 py-1.5">
                  <Pressable
                    onPress={() => {
                      setDetailsOpen(false);
                      router.navigate({ pathname: '/user/[username]', params: { username: m.username } });
                    }}
                    className="flex-1 flex-row items-center gap-3 active:opacity-70"
                  >
                    <Avatar name={m.display_name} uri={m.avatar_url} size="sm" />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className="text-sm font-semibold text-text-light dark:text-text-dark"
                          numberOfLines={1}
                        >
                          {m.display_name}
                          {m.id === viewerId ? ' (you)' : ''}
                        </Text>
                        {memberIsCreator ? (
                          <Ionicons name="star" size={11} color="#FE5800" />
                        ) : null}
                      </View>
                      <Text className="text-xs text-muted-light" numberOfLines={1}>
                        @{m.username}
                      </Text>
                    </View>
                  </Pressable>
                  {isCreator && !memberIsCreator ? (
                    <Pressable
                      onPress={() => setPendingRemove(m)}
                      className="rounded-full border border-red-300 px-3 py-1.5 active:opacity-70"
                      accessibilityLabel={t('group.removeMember', { name: m.display_name })}
                    >
                      <Text className="text-xs font-semibold text-red-600">Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
          <PrimaryButton
            label={t('group.inviteFriends')}
            variant="secondary"
            leftIcon={<Ionicons name="person-add-outline" size={14} color="#4B5FE0" />}
            onPress={() => {
              setDetailsOpen(false);
              setAddOpen(true);
            }}
            fullWidth
          />
          <PrimaryButton
            label={t('group.shareInviteLink')}
            variant="secondary"
            leftIcon={<Ionicons name="share-social-outline" size={14} color="#4B5FE0" />}
            onPress={() => {
              setDetailsOpen(false);
              void handleShare();
            }}
            fullWidth
          />
          <PrimaryButton
            label={t('group.leave')}
            variant="destructive-outline"
            onPress={() => {
              setDetailsOpen(false);
              setConfirmLeave(true);
            }}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Add friends to the group (member-only, friends-only) */}
      <AddGroupMembersSheet
        open={addOpen}
        viewerId={viewerId}
        groupId={group.id}
        existingIds={members.map((m) => m.id)}
        onClose={() => setAddOpen(false)}
        onAdded={() => void refetchMembers()}
      />

      {/* Share the 24h invite link via Telegram / WhatsApp / Viber / Copy */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        text={t('group.shareText', { emoji: group.emoji, name: group.name })}
        title={group.name}
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

      <ConfirmationDialog
        open={confirmLeave}
        title={t('group.leaveTitle', { name: group.name })}
        message={t('group.leaveMessage')}
        confirmLabel={t('group.leaveConfirm')}
        destructive
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />

      <ConfirmationDialog
        open={!!pendingRemove}
        title={t('group.removeTitle', { name: pendingRemove?.display_name ?? '' })}
        message={t('group.removeMessage')}
        confirmLabel={t('common.remove')}
        destructive
        onConfirm={handleRemoveMember}
        onCancel={() => setPendingRemove(null)}
      />
      <MessageSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        search={(q) => (groupId ? groupsService.searchMessages(groupId, q) : Promise.resolve([]))}
        onPick={(m) => {
          setSearchOpen(false);
          const i = visible.findIndex((x) => x.id === m.id);
          if (i >= 0) listRef.current?.scrollToIndex({ index: i, animated: true });
        }}
      />
    </SafeAreaView>
  );
}
