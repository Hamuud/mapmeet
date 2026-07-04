import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { distanceKm, formatDistance } from '@/utils/distance';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, LatLng } from '@/types';

type Props = {
  event: EventWithCreator | null;
  viewerLocation?: LatLng | null;
  onClose: () => void;
  onEdit?: (event: EventWithCreator) => void;
};

export function EventPreviewSheet({ event, viewerLocation, onClose, onEdit }: Props) {
  const toast = useToast();
  const { session } = useAuth();
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const isCreator = !!(event && session && event.creator_id === session.user.id);

  const distanceLabel =
    event && viewerLocation
      ? formatDistance(
          distanceKm(viewerLocation, {
            latitude: event.latitude,
            longitude: event.longitude,
          }),
        )
      : null;

  const handleJoinToggle = async () => {
    if (!event || !session) return;
    const wasJoined = event.is_joined;
    // Optimistic patch — realtime reconciles moments later.
    patchEvent(event.id, {
      is_joined: !wasJoined,
      participant_count: Math.max(
        0,
        event.participant_count + (wasJoined ? -1 : 1),
      ),
    });
    setBusy(true);
    try {
      if (wasJoined) await eventsService.leave(event.id, session.user.id);
      else await eventsService.join(event.id, session.user.id);
    } catch (e) {
      // Rollback on failure.
      patchEvent(event.id, {
        is_joined: wasJoined,
        participant_count: event.participant_count,
      });
      toast.show(e instanceof Error ? e.message : 'Could not update', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setConfirmDelete(false);
    try {
      await eventsService.remove(event.id);
      removeEvent(event.id);
      toast.show('Event deleted.', 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not delete', 'error');
    }
  };

  return (
    <>
      <BottomSheet open={!!event} onClose={onClose} heightPct={0.62}>
        {event ? (
          <View className="flex-1">
            <View className="flex-row items-center gap-4">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10">
                <Text style={{ fontSize: 32 }}>{event.emoji}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    className="flex-1 text-xl font-semibold text-text-light dark:text-text-dark"
                    numberOfLines={2}
                  >
                    {event.title}
                  </Text>
                  {event.visibility === 'private' ? (
                    <Badge
                      label="Private"
                      tone="private"
                      icon={<Ionicons name="lock-closed" size={10} color="#B45309" />}
                    />
                  ) : null}
                </View>
                <View className="mt-1 flex-row items-center gap-2">
                  <Ionicons name="calendar-outline" size={12} color="#8E8E93" />
                  <Text className="text-xs text-muted-light dark:text-muted-dark">
                    {formatEventDate(event.event_date)} · {formatEventTime(event.event_time)}
                  </Text>
                </View>
              </View>
            </View>

            {event.description ? (
              <Text className="mt-4 text-sm text-text-light dark:text-text-dark">
                {event.description}
              </Text>
            ) : null}

            <View className="mt-5 flex-row items-center gap-3">
              <Avatar
                name={event.creator.display_name}
                uri={event.creator.avatar_url}
                size="sm"
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
                  {event.creator.display_name}
                </Text>
                <Text className="text-xs text-muted-light dark:text-muted-dark">
                  @{event.creator.username}
                </Text>
              </View>
              {distanceLabel ? (
                <View className="rounded-full bg-elevated-light px-3 py-1 dark:bg-elevated-dark">
                  <Text className="text-xs font-semibold text-text-light dark:text-text-dark">
                    {distanceLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="mt-4 flex-row items-center gap-4">
              <Stat icon="people-outline" label={`${event.participant_count} going`} />
              {event.max_participants ? (
                <Stat icon="ribbon-outline" label={`Cap ${event.max_participants}`} />
              ) : null}
            </View>

            {isCreator ? (
              <View className="mt-4 flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Ionicons name="create-outline" size={14} color="#3757FF" />}
                    onPress={() => onEdit?.(event)}
                    fullWidth
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Delete"
                    variant="destructive"
                    size="sm"
                    leftIcon={<Ionicons name="trash-outline" size={14} color="#fff" />}
                    onPress={() => setConfirmDelete(true)}
                    fullWidth
                  />
                </View>
              </View>
            ) : null}

            <View className="mt-auto flex-row gap-3 pt-4">
              <View className="flex-1">
                <PrimaryButton
                  label="Close"
                  variant="secondary"
                  onPress={onClose}
                  fullWidth
                />
              </View>
              <View className="flex-1">
                {isCreator ? (
                  // Creators are implicit attendees — joining their own event
                  // was possible before and just looked buggy. Give them a
                  // status chip instead.
                  <View className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500/10">
                    <Ionicons name="star" size={14} color="#3757FF" />
                    <Text className="text-sm font-semibold text-brand-500">
                      You're hosting
                    </Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label={event.is_joined ? 'Joined ✓' : 'Join'}
                    variant={event.is_joined ? 'secondary' : 'primary'}
                    loading={busy}
                    onPress={handleJoinToggle}
                    fullWidth
                  />
                )}
              </View>
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmationDialog
        open={confirmDelete}
        title="Delete event?"
        message="This can't be undone. Attendees will lose their spot."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function Stat({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} color="#8E8E93" />
      <Text className="text-xs text-muted-light dark:text-muted-dark">{label}</Text>
    </View>
  );
}
