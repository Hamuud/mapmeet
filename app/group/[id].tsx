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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { groupsService, type GroupMember } from '@/services/groups.service';
import { invitesService } from '@/services/invites.service';
import { goBack } from '@/utils/nav';
import type { MessageWithSender } from '@/types';

/** Standalone group chat room (not tied to an event). Reuses the event
 *  chat's MessageBubble so sender names + avatars render the same way. */
export default function GroupRoomScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const [group, setGroup] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

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

  // Realtime — new messages from anyone in the group.
  useEffect(() => {
    if (!groupId || !viewerId) return;
    const ch = groupsService.subscribe(groupId, () => {
      // Cheapest correct path: refetch the window. Group chats are
      // low-volume; a targeted insert-merge isn't worth the sender-embed
      // refetch dance here.
      void groupsService.listMessages(groupId).then(setMessages);
      void groupsService.markRead(groupId).catch(() => {});
    });
    return () => groupsService.unsubscribe(ch);
  }, [groupId, viewerId]);

  const visible = useMemo(() => {
    if (!viewerId) return [];
    return messages.filter((m) => !m.deleted_for.includes(viewerId)).reverse();
  }, [messages, viewerId]);

  const handleSend = useCallback(async () => {
    if (!groupId || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft('');
    try {
      await groupsService.send(groupId, text);
      setMessages(await groupsService.listMessages(groupId));
    } catch (e) {
      setDraft(text);
      toast.show(e instanceof Error ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  }, [groupId, sending, draft, toast]);

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
      {/* Header — back · emoji/name/count · share · members */}
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
            <Text
              className="text-[15px] font-bold text-text-light dark:text-text-dark"
              numberOfLines={1}
            >
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
                  viewerId={viewerId}
                  onPressAvatar={(sender) =>
                    router.navigate({
                      pathname: '/user/[username]',
                      params: { username: sender.username },
                    })
                  }
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

        <View
          style={{ paddingBottom: insets.bottom }}
          className="border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
        >
          <View className="flex-row items-end gap-2 px-3 py-2">
            <View className="max-h-28 min-h-[44px] flex-1 justify-center rounded-3xl border border-border-light bg-elevated-light px-4 py-2 dark:border-border-dark dark:bg-elevated-dark">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message the group…"
                placeholderTextColor="#8B8880"
                multiline
                onKeyPress={(e) => {
                  if (Platform.OS !== 'web') return;
                  const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (key.key === 'Enter' && !key.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                className="text-[15px] text-text-light outline-none dark:text-text-dark"
                style={{ maxHeight: 96 }}
              />
            </View>
            <Pressable
              onPress={handleSend}
              disabled={sending || !draft.trim()}
              accessibilityLabel="Send message"
              className={[
                'h-11 w-11 items-center justify-center rounded-full',
                draft.trim() ? 'bg-accent-400' : 'bg-elevated-light dark:bg-elevated-dark',
              ].join(' ')}
            >
              <Ionicons name="paper-plane" size={17} color={draft.trim() ? '#fff' : '#8B8880'} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

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
                  router.navigate({
                    pathname: '/user/[username]',
                    params: { username: m.username },
                  });
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
