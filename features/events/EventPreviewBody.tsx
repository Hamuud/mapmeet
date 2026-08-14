import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useT } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useVenue } from '@/hooks/useVenue';
import { dmsService } from '@/services/dms.service';
import { eventsService } from '@/services/events.service';
import { invitesService } from '@/services/invites.service';
import { useEventsStore } from '@/store/events.store';
import { useModerationStore } from '@/store/moderation.store';
import { addEvent, downloadIcs, requestCalendarAccess } from '@/services/calendar.service';
import { distanceKm, formatDistance } from '@/utils/distance';
import { isEventPast } from '@/utils/eventTime';
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
  const t = useT();
  const toast = useToast();
  const { session } = useAuth();
  const venue = useVenue(event);
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const moderationGuard = useModerationStore((s) => s.guard);
  const [busy, setBusy] = useState(false);
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  // No point offering to diarise something that has already happened.
  const isPast = isEventPast(event);

  /** One-off add, independent of the Settings toggle.
   *
   *  Web has no calendar API, so it gets an .ics download — which opens
   *  in Google Calendar, Apple Calendar or Outlook and is arguably the
   *  more useful thing on a desktop anyway. */
  const handleAddToCalendar = async () => {
    if (addingToCalendar) return;
    setAddingToCalendar(true);
    try {
      if (Platform.OS === 'web') {
        downloadIcs(event);
        toast.show(t('event.addedToCalendar'), 'success');
        return;
      }
      const granted = await requestCalendarAccess();
      if (!granted) {
        toast.show(t('settings.calendarDenied'), 'info');
        return;
      }
      const id = await addEvent(event);
      if (!id) {
        toast.show(t('event.calendarFailed'), 'error');
        return;
      }
      toast.show(t('event.addedToCalendar'), 'success');
    } catch {
      toast.show(t('event.calendarFailed'), 'error');
    } finally {
      setAddingToCalendar(false);
    }
  };
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // Kept alongside the URL: sending to a friend posts the token itself,
  // not the link.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const isCreator = !!(session && event.creator_id === session.user.id);
  // Imported from a ticketing site (karabas.com etc.) rather than pinned
  // by a person: it gets a tickets link and a poster, and no "view the
  // host's profile" (the host is an import bot, not someone to meet).
  const isImported = event.source !== 'user';
  // City-precision imports have no real marker — routing to a city
  // centroid would send people to the wrong place, so no Directions.
  const hasExactLocation = event.geo_precision !== 'city';
  // Public events are shareable by anyone signed in; private ones only by
  // the host or someone who's joined (create_event_invite enforces this).
  const canShare =
    !!session && (event.visibility !== 'private' || isCreator || event.is_joined);

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
    // Joining is a restricted action while muted/banned; leaving isn't.
    if (!wasJoined && !moderationGuard()) return;
    // Extra guard so a stale UI can't fire off a doomed request.
    if (!wasJoined && isFull) {
      toast.show(t('events.full'), 'info');
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
        ? t('events.justFilled')
        : raw || t('events.couldNotUpdate');
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Mint a 24h invite link, then open the share sheet. Opening first with
  // a null url shows the sheet's "Creating link…" state so the tap is
  // instant even while the RPC is in flight.
  const handleShare = async () => {
    setShareUrl(null);
    setShareToken(null);
    setShareOpen(true);
    try {
      const token = await invitesService.create(event.id);
      setShareToken(token);
      setShareUrl(invitesService.shareUrl(token));
    } catch (e) {
      setShareOpen(false);
      toast.show(e instanceof Error ? e.message : t('preview.inviteFailed'), 'error');
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
          accessibilityLabel={t('preview.posterAlt', { title: event.title })}
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
              <Badge tone="accent" label={t('preview.private')} />
            ) : null}
            {distanceLabel ? (
              <Badge tone="neutral" label={t('preview.awayFrom', { d: distanceLabel })} />
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
              label={t('preview.directions')}
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
                {t('preview.seeVenueAbove')}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1.2 }}>
          {isCreator ? (
            <View className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-brand-500/10">
              <Ionicons name="star" size={13} color="#4B5FE0" />
              <Text className="text-sm font-semibold text-brand-500">
                {t('preview.hosting')}
              </Text>
            </View>
          ) : event.is_joined ? (
            <PrimaryButton
              label={t('preview.joined')}
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
              label={t('events.joinEvent')}
              variant="primary"
              loading={busy}
              onPress={handleJoinToggle}
              fullWidth
            />
          )}
        </View>
      </View>

      {/* Add to calendar. Present for anyone, joined or not — the
          automatic sync in Settings covers the joined case, but this is
          the one-off path, the discoverable one, and the only one that
          exists on web (where it hands over an .ics instead). */}
      {!isPast ? (
        <PrimaryButton
          label={t('event.addToCalendar')}
          variant="secondary"
          size="sm"
          leftIcon={<Ionicons name="calendar-outline" size={13} color="#4B5FE0" />}
          loading={addingToCalendar}
          onPress={handleAddToCalendar}
          fullWidth
        />
      ) : null}

      {/* Tickets — imported events link straight back to the source. */}
      {isImported && event.source_url ? (
        <PrimaryButton
          label={t('preview.getTickets')}
          variant="secondary"
          size="sm"
          leftIcon={<Ionicons name="ticket-outline" size={13} color="#4B5FE0" />}
          onPress={() => {
            const url = event.source_url;
            if (!url) return;
            void Linking.openURL(url).catch(() =>
              toast.show(t('preview.ticketPageFailed'), 'error'),
            );
          }}
          fullWidth
        />
      ) : null}

      {/* Share — mint a 24h link and open the Telegram / WhatsApp / Viber
          / Copy sheet. Public events: anyone signed in. Private events:
          host or someone who's joined (the RPC enforces the same rule). */}
      {canShare ? (
        <PrimaryButton
          label={t('preview.share')}
          variant="secondary"
          size="sm"
          leftIcon={
            <Ionicons name="share-social-outline" size={13} color="#4B5FE0" />
          }
          onPress={handleShare}
          fullWidth
        />
      ) : null}

      {/* Open chat — members (host or joined) get a straight path into
          the event's group chat from the pin itself. */}
      {onOpenChat && (isCreator || event.is_joined) ? (
        <PrimaryButton
          label={t('preview.chat')}
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
          label={t('preview.viewProfile', {
            name: event.creator.display_name.split(/\s+/)[0] ?? event.creator.display_name,
          })}
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
              label={t('events.edit')}
              variant="secondary"
              size="sm"
              leftIcon={<Ionicons name="create-outline" size={13} color="#4B5FE0" />}
              onPress={() => onEdit?.(event)}
              fullWidth
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label={t('common.delete')}
              variant="destructive-outline"
              size="sm"
              leftIcon={<Ionicons name="trash-outline" size={13} color="#B91C1C" />}
              onPress={() => onDelete?.(event)}
              fullWidth
            />
          </View>
        </View>
      ) : null}

      {/* Share: friends in-app (invite lands as an acceptable DM card),
          or out via Telegram / WhatsApp / Viber / Copy. */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        text={t('preview.inviteText', { emoji: event.emoji, title: event.title })}
        title={event.title}
        viewerId={session?.user.id ?? null}
        onSendToFriend={async (friendId) => {
          if (!shareToken) throw new Error(t('preview.inviteNotReady'));
          await dmsService.sendInvite(friendId, shareToken);
        }}
      />
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
  const t = useT();
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
          accessibilityLabel={expanded ? t('preview.collapseDescription') : t('preview.expandDescription')}
          className="flex-row items-center gap-1 self-start"
        >
          <Text className="text-[13px] font-semibold text-brand-500">
            {expanded ? t('preview.less') : t('preview.more')}
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
  const t = useT();
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
          ? t('common.loading')
          : t('preview.going', { count: total })}
        {maxParticipants ? t('preview.cap', { n: maxParticipants }) : ''}
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
