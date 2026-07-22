import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { groupsService, type GroupMember } from '@/services/groups.service';
import { invitesService } from '@/services/invites.service';
import { usePreferencesStore } from '@/store/preferences.store';
import { goBack } from '@/utils/nav';
import type { MessageWithSender } from '@/types';

/** Quick-reaction palette — matches the toggle_group_reaction whitelist. */
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** Standalone group chat room (not tied to an event). Same messaging
 *  features as event chats — replies, reactions, voice — reusing the
 *  shared MessageBubble + MessageInput. */
export default function GroupRoomScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const recorder = useVoiceRecorder();

  const [group, setGroup] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

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
      toast.show(e instanceof Error ? e.message : 'Could not open group', 'error');
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

  const handleSend = useCallback(
    async (text: string) => {
      if (!groupId) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await groupsService.send(groupId, text, replyTo);
      await refetch();
    },
    [groupId, replyingTo, refetch],
  );

  const handleStartVoice = useCallback(async () => {
    try {
      await recorder.start();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not start recording', 'error');
    }
  }, [recorder, toast]);

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
      toast.show(e instanceof Error ? e.message : 'Could not send voice message', 'error');
    }
  }, [groupId, viewerId, recorder, replyingTo, refetch, toast]);

  const handleToggleReaction = useCallback(
    async (message: MessageWithSender, emoji: string) => {
      try {
        await groupsService.toggleReaction(message.id, emoji);
        await refetch();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Could not react', 'error');
      }
    },
    [refetch, toast],
  );

  const handleShare = useCallback(async () => {
    if (!groupId || !group) return;
    try {
      const token = await groupsService.createInvite(groupId);
      const url = invitesService.groupShareUrl(token);
      const message = `${group.emoji} Join "${group.name}" on MapMeet\n${url}`;
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: group.name, url, text: message });
        } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          toast.show('Invite link copied. Good for 24 hours.', 'success');
        } else {
          toast.show(url, 'info');
        }
      } else {
        await Share.share({ message, url, title: group.name });
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create link', 'error');
    }
  }, [groupId, group, toast]);

  const handleLeave = useCallback(async () => {
    if (!groupId) return;
    setConfirmLeave(false);
    try {
      await groupsService.leave(groupId);
      toast.show('You left the group.', 'success');
      goBack('/(tabs)/chat');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not leave', 'error');
    }
  }, [groupId, toast]);

  if (!group) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState emoji="💬" title="Loading group…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header — back · emoji/name/count · share */}
      <View className="flex-row items-center gap-2.5 border-b border-border-light px-3 py-2 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/(tabs)/chat')}
          accessibilityLabel="Back"
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
          onPress={handleShare}
          accessibilityLabel="Share group invite link"
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
                  onPressAvatar={(sender) =>
                    router.navigate({ pathname: '/user/[username]', params: { username: sender.username } })
                  }
                  onToggleReaction={handleToggleReaction}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <EmptyState
                emoji="👋"
                title="Say hi"
                description="This is the start of your group. Share the link to bring more friends in."
              />
            </View>
          }
        />

        <View style={{ paddingBottom: insets.bottom }}>
          <MessageInput
            onSend={handleSend}
            onAttach={() => toast.show('Photos and video land next update.', 'info')}
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
            {members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setDetailsOpen(false);
                  router.navigate({ pathname: '/user/[username]', params: { username: m.username } });
                }}
                className="flex-row items-center gap-3 py-1.5"
              >
                <Avatar name={m.display_name} uri={m.avatar_url} size="sm" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-text-light dark:text-text-dark" numberOfLines={1}>
                    {m.display_name}
                    {m.id === viewerId ? ' (you)' : ''}
                  </Text>
                  <Text className="text-xs text-muted-light" numberOfLines={1}>
                    @{m.username}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label="Share invite link"
            variant="secondary"
            leftIcon={<Ionicons name="share-social-outline" size={14} color="#4B5FE0" />}
            onPress={() => {
              setDetailsOpen(false);
              void handleShare();
            }}
            fullWidth
          />
          <PrimaryButton
            label="Leave group"
            variant="destructive-outline"
            onPress={() => {
              setDetailsOpen(false);
              setConfirmLeave(true);
            }}
            fullWidth
          />
        </View>
      </BottomSheet>

      <ConfirmationDialog
        open={confirmLeave}
        title={`Leave ${group.name}?`}
        message="You'll stop receiving messages from this group. You can rejoin with an invite link."
        confirmLabel="Leave"
        destructive
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </SafeAreaView>
  );
}
