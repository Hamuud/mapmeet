import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useToast } from '@/components/ui/Toast';
import { eventsService } from '@/services/events.service';
import { messagesService } from '@/services/messages.service';
import type { EventWithCreator } from '@/types';

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  event: EventWithCreator;
  open: boolean;
  viewerId: string | null;
  onClose: () => void;
};

/** Member list for a chat. Everyone can view; the host additionally
 *  gets a Remove button per member (with confirmation). Removal goes
 *  through the host-only `remove_participant` RPC — the DB trigger
 *  posts the "<name> was removed" system message. */
export function MembersSheet({ event, open, viewerId, onClose }: Props) {
  const toast = useToast();
  const isHost = viewerId === event.creator_id;
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    eventsService
      .listAttendees(event.id, 50)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, event.id]);

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const target = pendingRemove;
    setPendingRemove(null);
    try {
      await messagesService.removeParticipant(event.id, target.id);
      setMembers((prev) => prev.filter((m) => m.id !== target.id));
      toast.show(`${target.display_name} removed.`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not remove', 'error');
    }
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} heightPct={0.7} autoHeight>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          Members · {members.length}
        </Text>
        <ScrollView className="mt-3" style={{ maxHeight: 380 }}>
          {members.map((m) => {
            const memberIsHost = m.id === event.creator_id;
            return (
              <View key={m.id} className="flex-row items-center gap-3 py-2">
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/user/[id]', params: { id: m.id } });
                  }}
                  className="flex-1 flex-row items-center gap-3"
                >
                  <Avatar name={m.display_name} uri={m.avatar_url} size="sm" />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        className="text-sm font-semibold text-text-light dark:text-text-dark"
                        numberOfLines={1}
                      >
                        {m.display_name}
                      </Text>
                      {memberIsHost ? (
                        <Ionicons name="star" size={11} color="#E68A5E" />
                      ) : null}
                    </View>
                    <Text className="text-xs text-muted-light" numberOfLines={1}>
                      @{m.username}
                    </Text>
                  </View>
                </Pressable>
                {isHost && !memberIsHost ? (
                  <Pressable
                    onPress={() => setPendingRemove(m)}
                    className="rounded-full border border-red-300 px-3 py-1.5"
                  >
                    <Text className="text-xs font-semibold text-red-600">Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <ConfirmationDialog
        open={!!pendingRemove}
        title={`Remove ${pendingRemove?.display_name ?? ''}?`}
        message="They'll be removed from the event and this chat. They can rejoin unless the event is full."
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
