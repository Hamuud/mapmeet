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

import { DateSeparator, dayKey } from '@/components/chat/DateSeparator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageInput } from '@/components/chat/MessageInput';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { dmsService } from '@/services/dms.service';
import { friendshipsService, type FriendshipState } from '@/services/friendships.service';
import { looksLikeUuid, profilesService } from '@/services/profiles.service';
import { usePreferencesStore } from '@/store/preferences.store';
import { goBack } from '@/utils/nav';
import type { MessageWithSender, Profile } from '@/types';

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** 1:1 direct message room. Same messaging features as event + group
 *  chats (replies, reactions, voice). The 1-message-per-side rule for
 *  non-friends lives on the server — the composer swaps for a lock
 *  strip once the cap is hit. */
export default function DmRoomScreen() {
  const { username: handleParam } = useLocalSearchParams<{ username: string }>();
  const handle = (handleParam ?? '').trim();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const recorder = useVoiceRecorder();

  const [other, setOther] = useState<Profile | null>(null);
  const [dmId, setDmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [friendship, setFriendship] = useState<FriendshipState>('none');
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(null);

  const refetch = useCallback(async (id: string) => {
    setMessages(await dmsService.listMessages(id));
    void dmsService.markRead(id).catch(() => {});
  }, []);

  useEffect(() => {
    if (!handle || !viewerId) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await profilesService.getByHandle(handle);
        if (!profile) throw new Error('User not found');
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
        await refetch(id);
      } catch (e) {
        if (!cancelled) toast.show(e instanceof Error ? e.message : 'Could not open DM', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, viewerId, toast, refetch]);

  // Realtime — refetch on any change.
  useEffect(() => {
    if (!dmId) return;
    const ch = dmsService.subscribe(dmId, () => void refetch(dmId));
    return () => dmsService.unsubscribe(ch);
  }, [dmId, refetch]);

  const visible = useMemo(() => [...messages].reverse(), [messages]);
  const byId = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const myCount = messages.filter((m) => m.sender_id === viewerId).length;
  const nonFriendBlocked = friendship !== 'friends' && myCount >= 1;

  const handleSend = useCallback(
    async (text: string) => {
      if (!other || !dmId) return;
      const replyTo = replyingTo?.id ?? null;
      setReplyingTo(null);
      await dmsService.sendText(other.id, text, replyTo);
      await refetch(dmId);
    },
    [other, dmId, replyingTo, refetch],
  );

  const handleStartVoice = useCallback(async () => {
    try {
      await recorder.start();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not start recording', 'error');
    }
  }, [recorder, toast]);

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
      toast.show(e instanceof Error ? e.message : 'Could not send voice message', 'error');
    }
  }, [other, dmId, viewerId, recorder, replyingTo, refetch, toast]);

  const handleToggleReaction = useCallback(
    async (message: MessageWithSender, emoji: string) => {
      if (!dmId) return;
      try {
        await dmsService.toggleReaction(message.id, emoji);
        await refetch(dmId);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Could not react', 'error');
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
        friendship === 'incoming' ? "You're friends now." : 'Friend request sent.',
        'success',
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not send request', 'error');
    }
  }, [other, viewerId, friendship, toast]);

  if (!other) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState emoji="💬" title="Loading DM…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
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
          onPress={() =>
            router.navigate({ pathname: '/user/[username]', params: { username: other.username } })
          }
          className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <Avatar name={other.display_name} uri={other.avatar_url} size="sm" />
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-text-light dark:text-text-dark" numberOfLines={1}>
              {other.display_name}
            </Text>
            <Text className="text-xs text-muted-light" numberOfLines={1}>
              @{other.username}
            </Text>
          </View>
        </Pressable>
        {friendship !== 'friends' ? (
          <Pressable
            onPress={handleAddFriend}
            className="rounded-full bg-brand-500 px-3 py-1.5"
            accessibilityLabel={friendship === 'incoming' ? 'Accept friend request' : 'Send friend request'}
          >
            <Text className="text-xs font-semibold text-white">
              {friendship === 'incoming'
                ? 'Accept'
                : friendship === 'outgoing'
                  ? 'Requested'
                  : 'Add friend'}
            </Text>
          </Pressable>
        ) : null}
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
                  onLongPress={(m) => setActionTarget(m)}
                  onContextMenu={(m) => setActionTarget(m)}
                  onReply={(m) => setReplyingTo(m)}
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
          {nonFriendBlocked ? (
            <View className="flex-row items-center gap-2 border-t border-border-light bg-panel-light px-4 py-3 dark:border-border-dark dark:bg-panel-dark">
              <Ionicons name="lock-closed" size={14} color="#8B8880" />
              <Text className="flex-1 text-xs text-muted-light">
                Add {other.display_name} as a friend to send more messages.
              </Text>
              <Pressable onPress={handleAddFriend} className="rounded-full bg-brand-500 px-3 py-1.5">
                <Text className="text-xs font-semibold text-white">
                  {friendship === 'incoming' ? 'Accept' : 'Add friend'}
                </Text>
              </Pressable>
            </View>
          ) : (
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
          )}
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
    </SafeAreaView>
  );
}
