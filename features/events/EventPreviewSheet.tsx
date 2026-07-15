import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

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

type Attendee = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const AVATAR_LIMIT = 6;

/** Peek preview docked at the bottom of the map. Shows the emoji + date
 *  chip + title + host, plus the description body and a horizontal row
 *  of attendee avatars so the viewer can see who else is going without
 *  drilling into a details screen. */
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
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const isCreator = !!(event && session && event.creator_id === session.user.id);

  // Refetch the attendee list every time a new event is selected. Cheap
  // (a single joined SELECT limited to N rows) and keeps the row in
  // sync with recent joins/leaves without needing to plumb Realtime
  // through the peek.
  useEffect(() => {
    if (!event) {
      setAttendees([]);
      return;
    }
    let cancelled = false;
    setLoadingAttendees(true);
    eventsService
      .listAttendees(event.id, AVATAR_LIMIT + 1)
      .then((rows) => {
        if (!cancelled) setAttendees(rows);
      })
      .catch(() => {
        // Non-fatal — the counts still render from event.participant_count.
        if (!cancelled) setAttendees([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAttendees(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event]);

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
      // Optimistically reflect the viewer in/out of the avatar row so it
      // matches the counter without a second network round-trip.
      const me: Attendee = {
        id: session.user.id,
        username:
          (session.user.user_metadata?.username as string | undefined) ?? 'you',
        display_name:
          (session.user.user_metadata?.display_name as string | undefined) ??
          'You',
        avatar_url:
          (session.user.user_metadata?.avatar_url as string | undefined) ??
          null,
      };
      setAttendees((prev) =>
        wasJoined
          ? prev.filter((p) => p.id !== me.id)
          : prev.some((p) => p.id === me.id)
            ? prev
            : [...prev, me],
      );
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

  // Creator sees an extra actions row and description takes vertical
  // space too — bump the fixed native height accordingly. Web autoHeight
  // shrinks to whatever the content ends up being.
  const heightPct = isCreator ? 0.58 : 0.5;

  return (
    <>
      <BottomSheet open={!!event} onClose={onClose} heightPct={heightPct} autoHeight>
        {event ? (
          <View className="gap-3">
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

            {/* Description ---------------------------------------- */}
            {event.description?.trim() ? (
              <Text
                className="text-sm leading-snug text-text-light dark:text-text-dark"
                numberOfLines={4}
              >
                {event.description}
              </Text>
            ) : null}

            {/* Attendees ------------------------------------------ */}
            <AttendeesRow
              attendees={attendees}
              total={event.participant_count}
              loading={loadingAttendees}
              maxParticipants={event.max_participants}
            />

            {/* Primary actions ------------------------------------ */}
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

/** Horizontal row of attendee avatars with an overflow chip + a text
 *  counter. Falls back to a plain "N going" line while the fetch is
 *  outstanding so the row never disappears mid-render. */
function AttendeesRow({
  attendees,
  total,
  loading,
  maxParticipants,
}: {
  attendees: Attendee[];
  total: number;
  loading: boolean;
  maxParticipants: number | null;
}) {
  const shown = attendees.slice(0, AVATAR_LIMIT);
  const overflow = Math.max(0, total - shown.length);

  return (
    <View className="flex-row items-center gap-2">
      {shown.length > 0 ? (
        <View className="flex-row">
          {shown.map((p, idx) => (
            <AttendeeAvatar key={p.id} attendee={p} index={idx} />
          ))}
          {overflow > 0 ? (
            <View
              className="h-8 w-8 items-center justify-center rounded-full border-2 border-panel-light bg-elevated-light dark:border-panel-dark dark:bg-elevated-dark"
              style={{ marginLeft: -8 }}
            >
              <Text className="text-[10px] font-semibold text-ink2-light dark:text-ink2-dark">
                +{overflow}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="h-8 w-8 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark">
          <Ionicons name="people" size={14} color="#8B8880" />
        </View>
      )}

      <Text className="text-xs font-medium text-ink2-light dark:text-ink2-dark">
        {loading && attendees.length === 0
          ? 'Loading…'
          : total === 1
            ? '1 going'
            : `${total} going`}
        {maxParticipants ? ` · cap ${maxParticipants}` : ''}
      </Text>
    </View>
  );
}

function AttendeeAvatar({ attendee, index }: { attendee: Attendee; index: number }) {
  const initial = (attendee.display_name || attendee.username || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <View
      className="h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-panel-light bg-brand-500/20 dark:border-panel-dark"
      style={{ marginLeft: index === 0 ? 0 : -8 }}
    >
      {attendee.avatar_url ? (
        <Image
          source={{ uri: attendee.avatar_url }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Text className="text-xs font-semibold text-brand-500">{initial}</Text>
      )}
    </View>
  );
}
