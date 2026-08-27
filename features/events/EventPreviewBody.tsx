import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useVenue } from '@/hooks/useVenue';
import { dmsService } from '@/services/dms.service';
import { eventsService } from '@/services/events.service';
import { invitesService } from '@/services/invites.service';
import { useEventsStore } from '@/store/events.store';
import { useAuthWallStore } from '@/store/authWall.store';
import { useModerationStore } from '@/store/moderation.store';
import { useSavedStore } from '@/store/saved.store';
import { addEvent, downloadIcs, requestCalendarAccess } from '@/services/calendar.service';
import { distanceKm, formatDistance } from '@/utils/distance';
import { isEventPast } from '@/utils/eventTime';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, LatLng } from '@/types';

import { ReportSheet } from '@/features/moderation/ReportSheet';
import { isEventLive } from '@/utils/eventTime';
import { AttendeesSheet } from './AttendeesSheet';
import { TellFriendSheet } from './TellFriendSheet';
import type { EventAttendee } from '@/types';

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
  // Guests get the whole preview and are stopped at the actions.
  const authGuard = useAuthWallStore((s) => s.guard);
  // Subscribe to this event's bookmark only, so saving one doesn't
  // re-render every other open sheet.
  const isSaved = useSavedStore((s) => !!s.ids[event.id]);
  const toggleSaved = useSavedStore((s) => s.toggle);
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
  /** Bookmark. The counterpart to Join, and the reason it sits beside it
   *  rather than three buttons down: "not yet" is the honest answer to
   *  most events, and until now the only ways to give it were to commit
   *  or to close the sheet and forget. */
  const handleToggleSaved = async () => {
    if (!authGuard('save')) return;
    if (!session) return;
    try {
      const nowSaved = await toggleSaved(event.id, session.user.id);
      toast.show(nowSaved ? t('saved.added') : t('saved.removed'), 'success');
    } catch {
      toast.show(t('saved.failed'), 'error');
    }
  };

  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendeesFailed, setAttendeesFailed] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // Kept alongside the URL: sending to a friend posts the token itself,
  // not the link.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [tellFriendOpen, setTellFriendOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [confirmStopRepeat, setConfirmStopRepeat] = useState(false);

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
    if (!session) {
      // The attendee RPC is for signed-in callers; a guest sees the
      // count that came with the event and nothing more. Skipping the
      // call avoids a guaranteed 401 on every preview they open.
      setAttendees([]);
      setLoadingAttendees(false);
      setAttendeesFailed(false);
      return;
    }
    setLoadingAttendees(true);
    setAttendeesFailed(false);
    // One call for both the avatar row and the full list behind it, so
    // opening "who's going" costs nothing. 50 is plenty: past that the
    // sheet is a scroll and nobody is counting.
    eventsService
      .listEventAttendees(event.id, 50)
      .then((rows) => {
        if (!cancelled) setAttendees(rows);
      })
      .catch(() => {
        // Keep the failure distinguishable from "everyone opted out of
        // being listed" — an empty list means very different things in
        // those two cases and the sheet says so.
        if (!cancelled) {
          setAttendees([]);
          setAttendeesFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAttendees(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id, session]);

  // Have I said I'm here? Only worth asking for events I'm going to.
  useEffect(() => {
    if (!event.is_joined) {
      setArrivedAt(null);
      return;
    }
    let cancelled = false;
    void eventsService.myArrival(event.id).then((at) => {
      if (!cancelled) setArrivedAt(at);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id, event.is_joined]);

  /** "I'm here." Announces once in the chat, which is the point — the
   *  other people circling the same café are the audience. */
  const handleCheckIn = async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    try {
      const at = await eventsService.checkIn(event.id);
      setArrivedAt(at);
      toast.show(t('checkin.done'), 'success');
    } catch (e) {
      // The function's refusals are written for a person to read.
      toast.show(e instanceof Error ? e.message : t('checkin.failed'), 'error');
    } finally {
      setCheckingIn(false);
    }
  };

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
    // A signed-out visitor gets the sign-in prompt here rather than at
    // the door: they have already seen what the event is, which is the
    // whole point of letting them this far.
    if (!authGuard('join')) return;
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
      const me: EventAttendee = {
        id: session.user.id,
        username:
          (session.user.user_metadata?.username as string | undefined) ?? 'you',
        display_name:
          (session.user.user_metadata?.display_name as string | undefined) ??
          'You',
        avatar_url:
          (session.user.user_metadata?.avatar_url as string | undefined) ??
          null,
        // Not your own friend. The flag only drives the "friends are
        // going" line, and counting yourself in it would be absurd.
        is_friend: false,
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
            {event.repeat_every ? (
              <Badge
                tone="neutral"
                label={t(
                  event.repeat_every === 'weekly'
                    ? 'preview.repeatsWeekly'
                    : event.repeat_every === 'fortnightly'
                      ? 'preview.repeatsFortnightly'
                      : 'preview.repeatsMonthly',
                )}
              />
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
            {t('preview.hostedBy', { name: event.creator.display_name })}
          </Text>
        </View>

        {/* Bookmark, top-right where a bookmark belongs — it costs no
            vertical space, and the actions below are already three deep.
            Hidden for the host (it's in their Created list) and for
            anything already over. */}
        {!isCreator && !isPast ? (
          <Pressable
            onPress={() => void handleToggleSaved()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t('saved.remove') : t('saved.add')}
            className={[
              'h-10 w-10 items-center justify-center rounded-full border',
              isSaved
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
            ].join(' ')}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={17}
              color={isSaved ? '#4B5FE0' : '#8B8880'}
            />
          </Pressable>
        ) : null}
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
        onPress={() => {
          if (!authGuard('join')) return;
          setAttendeesOpen(true);
        }}
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

      {/* "I'm here" — the one secondary action that stays full width,
          because it only exists inside the three-hour window around the
          event and is the thing you came to the screen to do. */}
      {event.is_joined && isEventLive(event) ? (
        arrivedAt ? (
          <View className="h-10 flex-row items-center justify-center gap-2 rounded-xl bg-brand-500/10">
            <Ionicons name="checkmark-done" size={14} color="#4B5FE0" />
            <Text className="text-sm font-semibold text-brand-500">
              {t('checkin.arrived')}
            </Text>
          </View>
        ) : (
          <PrimaryButton
            label={t('checkin.action')}
            variant="secondary"
            size="sm"
            leftIcon={<Ionicons name="location" size={13} color="#4B5FE0" />}
            loading={checkingIn}
            onPress={() => void handleCheckIn()}
            fullWidth
          />
        )
      ) : null}

      {/* ── Everything else, as icons ──────────────────────────────────
          These were six full-width buttons stacked down the sheet, which
          pushed the description and the attendee row off a phone screen
          and made every one of them look equally important. None of them
          is: they are the things you do *after* deciding, and a row of
          icons says that. Captions stay, because a shield glyph on its
          own does not tell anyone it means "tell a friend where I am". */}
      <View className="flex-row items-start justify-around gap-1 border-t border-border-light pt-3 dark:border-border-dark">
        {!isPast ? (
          <SheetAction
            icon="calendar-outline"
            label={t('sheet.calendar')}
            busy={addingToCalendar}
            onPress={handleAddToCalendar}
          />
        ) : null}

        {session && event.is_joined && !isPast ? (
          <SheetAction
            icon="shield-checkmark-outline"
            label={t('sheet.tellFriend')}
            onPress={() => setTellFriendOpen(true)}
          />
        ) : null}

        {canShare ? (
          <SheetAction
            icon="share-social-outline"
            label={t('sheet.share')}
            onPress={handleShare}
          />
        ) : null}

        {onOpenChat && (isCreator || event.is_joined) ? (
          <SheetAction
            icon="chatbubbles-outline"
            label={t('sheet.chat')}
            onPress={() => onOpenChat(event)}
          />
        ) : null}

        {/* Imported events link back to where you actually buy a ticket. */}
        {isImported && event.source_url ? (
          <SheetAction
            icon="ticket-outline"
            label={t('sheet.tickets')}
            onPress={() => {
              const url = event.source_url;
              if (!url) return;
              void Linking.openURL(url).catch(() =>
                toast.show(t('preview.ticketPageFailed'), 'error'),
              );
            }}
          />
        ) : null}

        {/* Not for your own event, and not for imports — their "host" is
            a scraper. */}
        {onViewHost && !isCreator && !isImported ? (
          <SheetAction
            icon="person-outline"
            label={t('sheet.host')}
            onPress={() => onViewHost(event)}
          />
        ) : null}

        {/* Host controls, last and destructive-last within that.
            They live in this row rather than in the pair of full-width
            buttons they used to be: they are things you do *to* an event
            you already own, not the reason you opened the sheet. Delete
            raises the parent's confirmation dialog — an icon this small
            must never be one tap from gone. */}
        {isCreator && onEdit ? (
          <SheetAction
            icon="create-outline"
            label={t('events.edit')}
            onPress={() => onEdit(event)}
          />
        ) : null}

        {isCreator && onDelete ? (
          <SheetAction
            icon="trash-outline"
            label={t('common.delete')}
            tone="danger"
            onPress={() => onDelete(event)}
          />
        ) : null}
      </View>

      {isCreator && event.repeat_every && event.series_id ? (
        <Pressable
          onPress={() => setConfirmStopRepeat(true)}
          hitSlop={6}
          className="flex-row items-center justify-center gap-1.5 py-1"
        >
          <Ionicons name="repeat" size={12} color="#8B8880" />
          <Text className="text-[11px] font-medium text-muted-light dark:text-muted-dark">
            {t('preview.stopRepeating')}
          </Text>
        </Pressable>
      ) : null}

      <ConfirmationDialog
        open={confirmStopRepeat}
        title={t('preview.stopRepeatTitle')}
        message={t('preview.stopRepeatMessage')}
        confirmLabel={t('preview.stopRepeating')}
        destructive
        onConfirm={() => {
          setConfirmStopRepeat(false);
          const series = event.series_id;
          if (!series) return;
          void eventsService
            .stopRepeat(series)
            .then((removed) => {
              patchEvent(event.id, { series_id: null, repeat_every: null });
              toast.show(t('preview.stopRepeatDone', { count: removed }), 'success');
            })
            .catch(() => toast.show(t('preview.stopRepeatFailed'), 'error'));
        }}
        onCancel={() => setConfirmStopRepeat(false)}
      />

      {/* Reporting the event itself, not its host. One tap from the
          thing that is wrong, rather than a detour through the profile of
          whoever posted it. Deliberately the quietest control here. */}
      {session && !isCreator ? (
        <Pressable
          onPress={() => setReportOpen(true)}
          hitSlop={6}
          className="flex-row items-center justify-center gap-1.5 py-1"
        >
          <Ionicons name="flag-outline" size={12} color="#8B8880" />
          <Text className="text-[11px] font-medium text-muted-light dark:text-muted-dark">
            {t('report.event')}
          </Text>
        </Pressable>
      ) : null}

      <TellFriendSheet
        open={tellFriendOpen}
        event={event}
        viewerId={session?.user.id ?? null}
        onClose={() => setTellFriendOpen(false)}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="event"
        targetId={event.id}
        targetUserId={event.creator_id}
        targetText={event.title}
        targetLabel={event.title}
      />

      {/* Share: friends in-app (invite lands as an acceptable DM card),
          or out via Telegram / WhatsApp / Viber / Copy. */}
      {/* Who's going, in full. Uses the list already fetched above, so
          opening it is instant and costs no request. */}
      <AttendeesSheet
        open={attendeesOpen}
        attendees={attendees}
        total={event.participant_count}
        failed={attendeesFailed}
        viewerId={session?.user.id ?? null}
        onClose={() => setAttendeesOpen(false)}
        onViewProfile={(a) => {
          setAttendeesOpen(false);
          router.navigate({
            pathname: '/user/[username]',
            params: { username: a.username },
          });
        }}
      />

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

const DANGER = '#B91C1C';
const BRAND = '#4B5FE0';

/** One action in the icon row: a tappable glyph with a caption under it.
 *
 *  Sized so six fit across a 375pt phone without the captions
 *  truncating — they wrap to two lines instead, which is why the row
 *  aligns to the top rather than the centre. Six is the worst case: a
 *  host looking at their own event gets Calendar, Tell a friend, Share,
 *  Chat, Edit and Delete.
 *
 *  `tone` exists for exactly one caller. Delete sitting in a row of
 *  identical blue glyphs would read as just another thing to try. */
function SheetAction({
  icon,
  label,
  onPress,
  busy = false,
  tone = 'brand',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: 'brand' | 'danger';
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center gap-1 active:opacity-60"
      style={{ maxWidth: 76 }}
    >
      <View
        className={[
          'h-11 w-11 items-center justify-center rounded-full border',
          danger
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
        ].join(' ')}
      >
        {busy ? (
          <ActivityIndicator size="small" color={danger ? DANGER : BRAND} />
        ) : (
          <Ionicons name={icon} size={18} color={danger ? DANGER : BRAND} />
        )}
      </View>
      <Text
        className={[
          'text-center text-[9.5px] font-medium leading-tight',
          danger ? 'text-red-700' : 'text-ink2-light dark:text-ink2-dark',
        ].join(' ')}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
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

/** The avatar row — now a button.
 *
 *  Who else is coming is the main thing anyone weighs about an event, so
 *  it opens the full list instead of being a decorative stack of faces
 *  you can't interrogate. The friends line sits underneath because "two
 *  friends are going" outperforms every other sentence on a page like
 *  this, and we can answer it without a single extra request. */
function AttendeesRow({
  attendees,
  total,
  loading,
  maxParticipants,
  onPress,
}: {
  attendees: EventAttendee[];
  total: number;
  loading: boolean;
  maxParticipants: number | null;
  onPress: () => void;
}) {
  const t = useT();
  const shown = attendees.slice(0, AVATAR_LIMIT);
  const overflow = Math.max(0, total - shown.length);
  const friends = attendees.filter((a) => a.is_friend).length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('attendees.open')}
      className="gap-1.5 active:opacity-70"
    >
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
        <Ionicons name="chevron-forward" size={12} color="#8B8880" />
      </View>

      {friends > 0 ? (
        <Text className="text-xs font-semibold text-brand-500">
          {t('attendees.friendsGoing', { count: friends })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function AttendeeAvatar({ attendee, index }: { attendee: EventAttendee; index: number }) {
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
