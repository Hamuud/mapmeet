import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

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
  onDirections?: (event: EventWithCreator) => void;
};

/** Compact peek preview docked at the bottom of the map. Matches the
 *  redesigned mockup: emoji tile + primary-tinted date pill + title +
 *  a single row of actions. Intentionally short so the map behind stays
 *  visible — full details / participant list would live in a "More"
 *  expanded state, deferred to a follow-up. */
export function EventPreviewSheet({
  event,
  viewerLocation,
  onClose,
  onEdit,
  onDirections,
}: Props) {
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

  // Creator sees an extra actions row so the sheet is a hair taller.
  const heightPct = isCreator ? 0.42 : 0.34;

  return (
    <>
      <BottomSheet open={!!event} onClose={onClose} heightPct={heightPct} autoHeight>
        {event ? (
          // No `flex-1`: with `autoHeight` the BottomSheet's inner wrapper
          // sizes to content, and a `flex-1` child of a content-sized
          // flex parent collapses to 0. Natural stacking + `gap-4` is
          // enough — the peek is a short row of blocks either way.
          <View className="gap-4">
            {/* Emoji tile + info column ---------------------------- */}
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-elevated-light dark:bg-elevated-dark">
                <Text style={{ fontSize: 26 }}>{event.emoji}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <Badge
                    tone="primary"
                    label={`${formatEventDate(event.event_date)} · ${formatEventTime(event.event_time)}`}
                  />
                  {event.visibility === 'private' ? (
                    <Badge tone="accent" label="Private" />
                  ) : null}
                  {distanceLabel ? (
                    <Badge tone="neutral" label={`${distanceLabel} away`} />
                  ) : null}
                </View>
                <Text
                  className="mt-1 text-base font-bold leading-tight text-text-light dark:text-text-dark"
                  numberOfLines={2}
                >
                  {event.title}
                </Text>
                <Text
                  className="text-xs text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  hosted by {event.creator.display_name}
                </Text>
              </View>
            </View>

            {/* Stats row -------------------------------------------- */}
            <View className="flex-row items-center gap-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="people" size={12} color="#8B8880" />
                <Text className="text-xs font-medium text-ink2-light dark:text-ink2-dark">
                  {event.participant_count} going
                </Text>
              </View>
              {event.max_participants ? (
                <>
                  <Text className="text-xs text-muted-light">·</Text>
                  <Text className="text-xs font-medium text-ink2-light dark:text-ink2-dark">
                    cap {event.max_participants}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Primary actions ------------------------------------- */}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label="Directions"
                  variant="secondary"
                  onPress={() => onDirections?.(event)}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1.2 }}>
                {isCreator ? (
                  <View className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-brand-500/10">
                    <Ionicons name="star" size={13} color="#4B5FE0" />
                    <Text className="text-sm font-semibold text-brand-500">
                      You're hosting
                    </Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label={event.is_joined ? 'Joined ✓' : 'Join event'}
                    variant={event.is_joined ? 'secondary' : 'primary'}
                    loading={busy}
                    onPress={handleJoinToggle}
                    fullWidth
                  />
                )}
              </View>
            </View>

            {/* Creator-only row ------------------------------------ */}
            {isCreator ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Ionicons name="create-outline" size={13} color="#4B5FE0" />}
                    onPress={() => onEdit?.(event)}
                    fullWidth
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Delete"
                    variant="destructive-outline"
                    size="sm"
                    leftIcon={<Ionicons name="trash-outline" size={13} color="#B91C1C" />}
                    onPress={() => setConfirmDelete(true)}
                    fullWidth
                  />
                </View>
              </View>
            ) : null}
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

