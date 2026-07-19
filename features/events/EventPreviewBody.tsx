import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useVenue } from '@/hooks/useVenue';
import { eventsService } from '@/services/events.service';
import { invitesService } from '@/services/invites.service';
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
  /** Members only: jump straight into the event's group chat. Omitted
   *  by callers already inside the chat (the pinned-event sheet). */
  onOpenChat?: (event: EventWithCreator) => void;
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
  onOpenChat,
}: Props) {
  const toast = useToast();
  const { session } = useAuth();
  const venue = useVenue(event);
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const [busy, setBusy] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const isCreator = !!(session && event.creator_id === session.user.id);
  // Imported from a ticketing site (karabas.com etc.) rather than pinned
  // by a person: it gets a tickets link and a poster, and no "view the
  // host's profile" (the host is an import bot, not someone to meet).
  const isImported = event.source !== 'user';
  // City-precision imports have no real marker — routing to a city
  // centroid would send people to the wrong place, so no Directions.
  const hasExactLocation = event.geo_precision !== 'city';

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

  // Cap is inclusive of the host (who always auto-joins at create
  // time). So max=2 means "host + 1 more", max=4 means "host + 3".
  // `isFull` is the client-side gate; the DB has its own trigger
  // that raises 23514 on any join attempt past the cap.
  const isFull =
    event.max_participants != null &&
    event.participant_count >= event.max_participants;

  const handleJoinToggle = async () => {
    if (!session) return;
    const wasJoined = event.is_joined;
    // Extra guard so a stale UI can't fire off a doomed request.
    if (!wasJoined && isFull) {
      toast.show('Event is full.', 'info');
      return;
    }
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
      // Trigger raises with '... is full ...' — surface as a friendly
      // message rather than the raw Postgres error string.
      const raw = e instanceof Error ? e.message : '';
      const msg = /is full/i.test(raw)
        ? 'Event just filled up — try another one.'
        : raw || 'Could not update';
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      {/* Poster — imported events ship one; user events don't (yet). */}
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={{ width: '100%', height: 132, borderRadius: 16 }}
          resizeMode="cover"
          accessibilityLabel={`${event.title} poster`}
        />
      ) : null}

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

      {/* Venue — the searched address label, or a reverse-geocoded
          fallback for events created before addresses were stored. */}
      {venue ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="location" size={13} color="#4B5FE0" />
          <Text
            className="flex-1 text-[13px] font-medium text-brand-500"
            numberOfLines={2}
          >
            {venue}
          </Text>
        </View>
      ) : null}

      {/* Description — clamped with a More/Less toggle. Imported events
          carry long blurbs + a poster; at full length they pushed the
          action buttons under the tab bar, unclickable. */}
      {event.description?.trim() ? (
        <DescriptionBlock text={event.description.trim()} />
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
          {hasExactLocation ? (
            <PrimaryButton
              label="Directions"
              variant="secondary"
              onPress={() => onDirections?.(event)}
              fullWidth
            />
          ) : (
            // We only know the city, so we say so instead of routing
            // people to a centroid and pretending it's the venue.
            <View className="h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border-light bg-elevated-light px-2 dark:border-border-dark dark:bg-elevated-dark">
              <Ionicons name="information-circle-outline" size={13} color="#8B8880" />
              <Text
                className="text-xs font-semibold text-muted-light"
                numberOfLines={1}
              >
                See venue above
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1.2 }}>
          {isCreator ? (
            <View className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-brand-500/10">
              <Ionicons name="star" size={13} color="#4B5FE0" />
              <Text className="text-sm font-semibold text-brand-500">
                You're hosting
              </Text>
            </View>
          ) : event.is_joined ? (
            <PrimaryButton
              label="Joined ✓"
              variant="secondary"
              loading={busy}
              onPress={handleJoinToggle}
              fullWidth
            />
          ) : isFull ? (
            // Non-interactive "Full" pill — matches the button footprint
            // but reads as a status, not an action.
            <View className="h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark">
              <Ionicons name="lock-closed" size={13} color="#8B8880" />
              <Text className="text-sm font-semibold text-muted-light">
                Full · {event.participant_count}/{event.max_participants}
              </Text>
            </View>
          ) : (
            <PrimaryButton
              label="Join event"
              variant="primary"
              loading={busy}
              onPress={handleJoinToggle}
              fullWidth
            />
          )}
        </View>
      </View>

      {/* Tickets — imported events link straight back to the source. */}
      {isImported && event.source_url ? (
        <PrimaryButton
          label="Get tickets"
          variant="secondary"
          size="sm"
          leftIcon={<Ionicons name="ticket-outline" size={13} color="#4B5FE0" />}
          onPress={() => {
            const url = event.source_url;
            if (!url) return;
            void Linking.openURL(url).catch(() =>
              toast.show('Could not open the ticket page.', 'error'),
            );
          }}
          fullWidth
        />
      ) : null}

      {/* Invite — host + participants can mint a 24h shareable link.
          Native: system share sheet; web: clipboard + toast. Available
          only for user-created events (imported ones already carry
          their own Get-tickets link). */}
      {!isImported && (isCreator || event.is_joined) ? (
        <PrimaryButton
          label="Invite friends"
          variant="secondary"
          size="sm"
          leftIcon={
            <Ionicons name="share-social-outline" size={13} color="#4B5FE0" />
          }
          onPress={async () => {
            try {
              const token = await invitesService.create(event.id);
              const url = invitesService.shareUrl(token);
              const message = `${event.emoji} You're invited: ${event.title}\n${url}`;
              if (Platform.OS === 'web') {
                if (typeof navigator !== 'undefined' && navigator.share) {
                  await navigator.share({ title: event.title, url, text: message });
                } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  await navigator.clipboard.writeText(url);
                  toast.show('Invite link copied. Good for 24 hours.', 'success');
                } else {
                  toast.show(url, 'info');
                }
              } else {
                await Share.share({ message, url, title: event.title });
              }
            } catch (e) {
              toast.show(
                e instanceof Error ? e.message : 'Could not create invite',
                'error',
              );
            }
          }}
          fullWidth
        />
      ) : null}

      {/* Open chat — members (host or joined) get a straight path into
          the event's group chat from the pin itself. */}
      {onOpenChat && (isCreator || event.is_joined) ? (
        <PrimaryButton
          label="Chat"
          variant="secondary"
          size="sm"
          leftIcon={
            <Ionicons name="chatbubbles-outline" size={13} color="#4B5FE0" />
          }
          onPress={() => onOpenChat(event)}
          fullWidth
        />
      ) : null}

      {/* View host — hidden when this IS the host to avoid pointing
          users at their own profile from their own event, and for
          imported events (the "host" is an import bot). */}
      {onViewHost && !isCreator && !isImported ? (
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

const DESC_PREVIEW_LINES = 3;
/** Below this length three lines almost never truncate — hide the toggle
 *  instead of dangling a "More" that expands nothing. */
const DESC_TOGGLE_MIN_CHARS = 140;

/** Event description with a More/Less toggle.
 *
 *  Collapsed: 3 lines, so the peek stays short and the action buttons
 *  dock above the tab bar even with a poster. Expanded: the full text,
 *  growing the sheet (autoHeight re-measures) — but capped at ~30% of
 *  the viewport and scrollable inside that cap, so on small phones the
 *  longest description still can't shove the buttons off screen. */
function DescriptionBlock({ text }: { text: string }) {
  const { height: winHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const toggleable = text.length > DESC_TOGGLE_MIN_CHARS || text.includes('\n');

  const body = (
    <Text
      className="text-sm leading-snug text-text-light dark:text-text-dark"
      numberOfLines={expanded ? undefined : DESC_PREVIEW_LINES}
    >
      {text}
    </Text>
  );

  return (
    <View className="gap-1">
      {expanded ? (
        <ScrollView
          style={{ maxHeight: Math.round(winHeight * 0.3) }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {toggleable ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse description' : 'Expand description'}
          className="flex-row items-center gap-1 self-start"
        >
          <Text className="text-[13px] font-semibold text-brand-500">
            {expanded ? 'Less' : 'More'}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color="#4B5FE0"
          />
        </Pressable>
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
