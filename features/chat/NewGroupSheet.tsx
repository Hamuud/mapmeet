import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { friendshipsService, type FriendRow } from '@/services/friendships.service';
import { groupsService } from '@/services/groups.service';

type Props = {
  open: boolean;
  viewerId: string | null;
  onClose: () => void;
  /** Called after a group is created, with its id — parent refreshes. */
  onCreated: (groupId: string) => void;
};

const EMOJI_CHOICES = ['💬', '🎉', '🍕', '⚽', '🎸', '🏔️', '🎮', '☕'];

/** Create-group sheet: name + emoji + pick friends. Only friends are
 *  selectable (the server enforces the same rule). */
export function NewGroupSheet({ open, viewerId, onClose, onCreated }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]!);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !viewerId) return;
    // Reset each open, then load the friend list.
    setName('');
    setEmoji(EMOJI_CHOICES[0]!);
    setSelected(new Set());
    friendshipsService
      .listFriends(viewerId)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [open, viewerId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.show('Give the group a name.', 'error');
      return;
    }
    if (selected.size === 0) {
      toast.show('Pick at least one friend.', 'error');
      return;
    }
    setCreating(true);
    try {
      const groupId = await groupsService.create(trimmed, emoji, [...selected]);
      onCreated(groupId);
      onClose();
      router.navigate({ pathname: '/group/[id]', params: { id: groupId } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create group', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.85} autoHeight>
      <View className="gap-4 pb-2">
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          New group
        </Text>

        {/* Emoji + name row */}
        <View className="flex-row items-center gap-2">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-elevated-light dark:bg-elevated-dark">
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
          </View>
          <View className="max-h-12 flex-1 justify-center rounded-2xl border border-border-light bg-elevated-light px-4 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              placeholderTextColor="#8B8880"
              maxLength={60}
              className="text-[15px] text-text-light outline-none dark:text-text-dark"
            />
          </View>
        </View>

        {/* Emoji picker */}
        <View className="flex-row flex-wrap gap-2">
          {EMOJI_CHOICES.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              className={[
                'h-10 w-10 items-center justify-center rounded-xl border',
                e === emoji
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
              ].join(' ')}
            >
              <Text style={{ fontSize: 18 }}>{e}</Text>
            </Pressable>
          ))}
        </View>

        {/* Friend picker */}
        <View className="flex-row items-baseline justify-between">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            Add friends
          </Text>
          <Text className="text-[11px] text-muted-light">{selected.size} selected</Text>
        </View>

        {friends.length === 0 ? (
          <View className="items-center gap-1 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
            <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
              No friends yet
            </Text>
            <Text className="text-center text-xs text-muted-light">
              Add friends from their profile first — groups are made of your friends.
            </Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <View className="gap-1">
              {friends.map((f) => {
                const on = selected.has(f.other.id);
                return (
                  <Pressable
                    key={f.other.id}
                    onPress={() => toggle(f.other.id)}
                    className="flex-row items-center gap-3 rounded-xl px-1 py-2 active:opacity-70"
                  >
                    <Avatar name={f.other.display_name} uri={f.other.avatar_url} size="sm" />
                    <View className="flex-1">
                      <Text
                        className="text-sm font-semibold text-text-light dark:text-text-dark"
                        numberOfLines={1}
                      >
                        {f.other.display_name}
                      </Text>
                      <Text className="text-xs text-muted-light" numberOfLines={1}>
                        @{f.other.username}
                      </Text>
                    </View>
                    <View
                      className={[
                        'h-6 w-6 items-center justify-center rounded-full border',
                        on
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-border-light dark:border-border-dark',
                      ].join(' ')}
                    >
                      {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        <PrimaryButton
          label="Create group"
          loading={creating}
          disabled={!name.trim() || selected.size === 0}
          onPress={handleCreate}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
