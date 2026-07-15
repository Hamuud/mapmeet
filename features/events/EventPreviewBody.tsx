import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { distanceKm, formatDistance } from '@/utils/distance';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, LatLng } from '@/types';

type Attendee = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  event: EventWithCreator;
  viewerLocation?: LatLng | null;
  onEdit?: (event: EventWithCreator) => void;
  onDirections?: (event: EventWithCreator) => void;
  onDelete?: (event: EventWithCreator) => void;
  onViewHost?: (event: EventWithCreator) => void;
  /** Called after a successful DB deletion so parent can refresh
   *  local state / close the peek. Delete confirmation lives with the
   *  parent (BottomSheet in the mobile case, panel header on desktop),
   *  so this body stays presentation-only. */
};

const AVATAR_LIMIT = 6;

/** Shared visual content of an event preview: emoji tile + date badge +
 *  title + host + description + attendee row + primary actions. Used
 *  by both `EventPreviewSheet` (mobile bottom peek) and
 *  `MapDesktopEventPanel` (desktop left-rail replacement) so the two
 *  paths can't drift visually. */
export function EventPreviewBody({
  event,
  viewerLocation,
  onEdit,
  onDirections,
  onDelete,
  onViewHost,
}: Props) {
  const toast = useToast();
  const { session } = useAuth();
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const [busy, setBusy] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const isCreator = !!(session && event.creator_id === session.user.id);

  useEffect(() => {
    let cancelled = false;
    setLoadingAttendees(true);
    eventsService
      .listAttendees(event.id, AVATAR_LIMIT + 1)
      .then((rows) => {
        if (!cancelled) setAttendees(rows);
      })
      .catch(() => {
        if (!cancelled) setAttendees([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAttendees(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const distanceLabel = viewerLocation
    ? formatDistance(
        distanceKm(viewerLocation, {
          latitude: event.latitude,
          longitude: event.longitude,
        }),
      )
    : null;

  const handleJoinToggle = async () => {
    if (!session) return;
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

  return (
    <View className="gap-3">
      {/* Emoji tile + info column */}
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

      {/* Description */}
      {event.description?.trim() ? (
        <Text
          className="text-sm leading-snug text-text-light dark:text-text-dark"
          numberOfLines={6}
        >
          {event.description}
        </Text>
      ) : null}

      {/* Attendees */}
      <AttendeesRow
        attendees={attendees}
        total={event.participant_count}
        loading={loadingAttendees}
        maxParticipants={event.max_participants}
      />

      {/* Primary actions */}
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

      {/* View host — hidden when this IS the host to avoid pointing
          users at their own profile from their own event. */}
      {onViewHost && !isCreator ? (
        <PrimaryButton
          label={`View ${event.creator.display_name.split(/\s+/)[0]}'s profile`}
          variant="secondary"
          size="sm"
          leftIcon={
            <Ionicons name="person-outline" size={13} color="#4B5FE0" />
          }
          onPress={() => onViewHost(event)}
          fullWidth
        />
      ) : null}

      {/* Creator-only row */}
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
              onPress={() => onDelete?.(event)}
              fullWidth
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

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
