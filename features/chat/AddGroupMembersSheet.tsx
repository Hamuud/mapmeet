import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { friendshipsService, type FriendRow } from '@/services/friendships.service';
import { groupsService } from '@/services/groups.service';

type Props = {
  open: boolean;
  viewerId: string | null;
  groupId: string;
  /** Ids already in the group — filtered out of the picker. */
  existingIds: string[];
  onClose: () => void;
  /** Called after members are added so the room refreshes its list. */
  onAdded: () => void;
};

/** Add-friends-to-an-existing-group sheet. Same friends-only rule as
 *  creating a group (the server enforces it too); friends who are
 *  already members are hidden. */
export function AddGroupMembersSheet({
  open,
  viewerId,
  groupId,
  existingIds,
  onClose,
  onAdded,
}: Props) {
  const toast = useToast();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || !viewerId) return;
    setSelected(new Set());
    friendshipsService
      .listFriends(viewerId)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [open, viewerId]);

  // Friends not already in the group.
  const candidates = useMemo(() => {
    const have = new Set(existingIds);
    return friends.filter((f) => !have.has(f.other.id));
  }, [friends, existingIds]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      await groupsService.addMembers(groupId, [...selected]);
      toast.show(
        selected.size === 1 ? 'Friend added.' : `${selected.size} friends added.`,
        'success',
      );
      onAdded();
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not add friends', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8} autoHeight>
      <View className="gap-4 pb-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Invite friends
          </Text>
          <Text className="text-[11px] text-muted-light">{selected.size} selected</Text>
        </View>

        {candidates.length === 0 ? (
          <View className="items-center gap-1 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
            <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
              {friends.length === 0 ? 'No friends yet' : 'Everyone’s already in'}
            </Text>
            <Text className="text-center text-xs text-muted-light">
              {friends.length === 0
                ? 'Add friends from their profile first — you can only add friends to a group.'
                : 'All of your friends are already members. Share the invite link to bring in others.'}
            </Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            <View className="gap-1">
              {candidates.map((f) => {
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
          label="Add to group"
          loading={adding}
          disabled={selected.size === 0}
          onPress={handleAdd}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
