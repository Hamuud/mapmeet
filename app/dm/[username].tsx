import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { dmsService, type DmMessage } from '@/services/dms.service';
import { friendshipsService, type FriendshipState } from '@/services/friendships.service';
import { looksLikeUuid, profilesService } from '@/services/profiles.service';
import { goBack } from '@/utils/nav';
import type { Profile } from '@/types';

/** 1:1 direct message room. The route param is the OTHER person's
 *  username (with UUID fallback so a legacy link stays valid). We
 *  resolve them, ensure the DM row exists, then load messages.
 *
 *  The 1-message-per-side rule (for non-friends) lives on the server —
 *  the composer just surfaces the resulting error and disables itself
 *  until the friendship flips. */
export default function DmRoomScreen() {
  const { username: handleParam } = useLocalSearchParams<{ username: string }>();
  const handle = (handleParam ?? '').trim();
  const toast = useToast();
  const iconColor = useIconColor();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const [other, setOther] = useState<Profile | null>(null);
  const [dmId, setDmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [friendship, setFriendship] = useState<FriendshipState>('none');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Load the other person + ensure the room + fetch history.
  useEffect(() => {
    if (!handle || !viewerId) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await profilesService.getByHandle(handle);
        if (!profile) throw new Error('User not found');
        if (cancelled) return;
        setOther(profile);
        // If this was a UUID URL, replace it with the handle now that
        // we know it — cleans up shareable /dm/<uuid> links.
        if (looksLikeUuid(handle) && profile.username !== handle) {
          router.replace({
            pathname: '/dm/[username]',
            params: { username: profile.username },
          });
        }
        const [id, state] = await Promise.all([
          dmsService.ensureRoom(profile.id),
          friendshipsService.getState(viewerId, profile.id),
        ]);
        if (cancelled) return;
        setDmId(id);
        setFriendship(state);
        const msgs = await dmsService.listMessages(id);
        if (!cancelled) setMessages(msgs);
        void dmsService.markRead(id).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          toast.show(e instanceof Error ? e.message : 'Could not open DM', 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, viewerId, toast]);

  // Realtime — pushes the other side's new messages into the list.
  useEffect(() => {
    if (!dmId || !viewerId) return;
    const ch = dmsService.subscribe(dmId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== viewerId) void dmsService.markRead(dmId).catch(() => {});
    });
    return () => dmsService.unsubscribe(ch);
  }, [dmId, viewerId]);

  const nonFriendMineCount = messages.filter((m) => m.sender_id === viewerId).length;
  const nonFriendBlocked = friendship !== 'friends' && nonFriendMineCount >= 1;

  const handleSend = useCallback(async () => {
    if (!other || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await dmsService.sendText(other.id, text);
      setDraft('');
      // Refetch — realtime will also fire, but a manual pull covers the
      // case where the WebSocket has drifted (iOS sim in particular).
      if (dmId) setMessages(await dmsService.listMessages(dmId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  }, [other, sending, draft, dmId, toast]);

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
      {/* Header — back · avatar · name · profile chevron */}
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
            router.navigate({
              pathname: '/user/[username]',
              params: { username: other.username },
            })
          }
          className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <Avatar name={other.display_name} uri={other.avatar_url} size="sm" />
          <View className="flex-1">
            <Text
              className="text-[15px] font-bold text-text-light dark:text-text-dark"
              numberOfLines={1}
            >
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
            accessibilityLabel={
              friendship === 'incoming' ? 'Accept friend request' : 'Send friend request'
            }
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
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          inverted
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => (
            <DmBubble message={item} isOwn={item.sender_id === viewerId} />
          )}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <EmptyState
                emoji="👋"
                title="Say hi"
                description={
                  friendship === 'friends'
                    ? "You're friends — chat away."
                    : friendship === 'outgoing'
                      ? 'Waiting for them to accept your friend request. You can send one message meanwhile.'
                      : friendship === 'incoming'
                        ? "Accept the request to unlock messaging both ways."
                        : "You aren't friends yet — you can send one message. Adding each other as friends unlocks the rest."
                }
              />
            </View>
          }
        />

        <View
          style={{ paddingBottom: insets.bottom }}
          className="border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
        >
          {nonFriendBlocked ? (
            <View className="flex-row items-center gap-2 px-4 py-3">
              <Ionicons name="lock-closed" size={14} color="#8B8880" />
              <Text className="flex-1 text-xs text-muted-light">
                Add {other.display_name} as a friend to send more messages.
              </Text>
              <Pressable
                onPress={handleAddFriend}
                className="rounded-full bg-brand-500 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-white">
                  {friendship === 'incoming' ? 'Accept' : 'Add friend'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-end gap-2 px-3 py-2">
              <View className="max-h-28 min-h-[44px] flex-1 justify-center rounded-3xl border border-border-light bg-elevated-light px-4 py-2 dark:border-border-dark dark:bg-elevated-dark">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={
                    friendship === 'friends'
                      ? 'Message…'
                      : 'Send one message to break the ice'
                  }
                  placeholderTextColor="#8B8880"
                  multiline
                  onKeyPress={(e) => {
                    if (Platform.OS !== 'web') return;
                    const key = e.nativeEvent as unknown as {
                      key: string;
                      shiftKey?: boolean;
                    };
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
                  draft.trim()
                    ? 'bg-accent-400'
                    : 'bg-elevated-light dark:bg-elevated-dark',
                ].join(' ')}
              >
                <Ionicons
                  name="paper-plane"
                  size={17}
                  color={draft.trim() ? '#fff' : '#8B8880'}
                />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DmBubble({ message, isOwn }: { message: DmMessage; isOwn: boolean }) {
  if (message.type === 'invite') {
    // Placeholder — the invite-message card lands with the DM Invite
    // wiring in a follow-up; today the URL still routes correctly.
    return (
      <View className={`my-0.5 px-4 ${isOwn ? 'items-end' : 'items-start'}`}>
        <View className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-3">
          <Text className="text-[13px] font-semibold text-brand-500">
            🎟 Event invite
          </Text>
          <Text className="text-[12px] text-muted-light">
            Open at /invite/{message.event_invite_token}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className={`my-0.5 px-4 ${isOwn ? 'items-end' : 'items-start'}`}>
      <View
        className={[
          'max-w-[78%] rounded-2xl px-3.5 py-2.5',
          isOwn
            ? 'rounded-br-md bg-text-light dark:bg-text-dark'
            : 'rounded-bl-md border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
        ].join(' ')}
      >
        <Text
          className={
            isOwn
              ? 'text-[15px] leading-snug text-surface-light dark:text-surface-dark'
              : 'text-[15px] leading-snug text-text-light dark:text-text-dark'
          }
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}
