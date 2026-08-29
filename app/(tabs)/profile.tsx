import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ReviewCard } from '@/components/user/ReviewCard';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { PastEventSheet } from '@/features/events/PastEventSheet';
import { GuestGate } from '@/features/auth/GuestGate';
import { useT } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { ratingsService, type UserReview } from '@/services/ratings.service';
import { useEventsStore } from '@/store/events.store';
import { isEventPast } from '@/utils/eventTime';
import { formatRating } from '@/utils/rating';
import { INTERESTS_BY_KEY } from '@/utils/interests';
import type { EventWithCreator } from '@/types';

type Tab = 'hosting' | 'attending' | 'past' | 'reviews';

/** Left-to-right order of the tabs. The swipe gesture walks this, so it
 *  has to match what the segmented control renders. */
const TABS: Tab[] = ['hosting', 'attending', 'past', 'reviews'];

/** How far across the screen a drag has to get before releasing it
 *  changes tab. A flick past `SWIPE_VELOCITY` counts too, so a quick
 *  gesture doesn't have to travel the distance. */
const SWIPE_TRIGGER = 0.22;
const SWIPE_VELOCITY = 0.45;

/** Past the first or last tab there is nothing to move to, so the drag
 *  is damped to a third of the finger and capped. That resistance IS
 *  the message: the panel gives, so you know the gesture was heard, and
 *  it refuses, so you know there is nothing behind it. Springing back
 *  from a dead stop would read as a broken swipe instead. */
const EDGE_RESIST = 0.32;
const EDGE_MAX = 64;

/** "You" tab — the redesigned profile screen. Big avatar + display
 *  name + @handle line, optional bio + interest chips, Events / Joined
 *  stats, and a Hosting / Attending / Past event list. Settings live
 *  behind the ⚙️ button in the header; Edit profile is its own screen. */
export default function YouScreen() {
  const t = useT();
  const { profile } = useAuth();
  const { session } = useAuth();
  const isGuest = !session;
  const iconColor = useIconColor();
  const events = useEventsStore((s) => s.events);
  const focusEvent = useEventsStore((s) => s.focusEvent);
  const [tab, setTab] = useState<Tab>('hosting');
  const [pastEvent, setPastEvent] = useState<EventWithCreator | null>(null);

  // Taxi-style rating — starts at 5.00, moved by likes/dislikes from
  // other users (they vote on your public profile page).
  const [rating, setRating] = useState<string | null>(null);
  // Anonymous reviews left about you — visible to you, still authorless.
  const [reviews, setReviews] = useState<UserReview[]>([]);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    ratingsService
      .getSummary(profile.id)
      .then((s) => {
        if (!cancelled) setRating(formatRating(s.likes, s.dislikes));
      })
      .catch(() => {
        /* rating hidden until the migration lands — non-fatal */
      });
    ratingsService
      .listReviews(profile.id)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const { hostingCount, attendingCount, hosting, attending, past } = useMemo(() => {
    // Every hook above has already run: this refusal has to sit
  // below them or the screen would break the rules of hooks the
  // first time a guest opens it.
  if (!profile) {
      return { hostingCount: 0, attendingCount: 0, hosting: [], attending: [], past: [] };
    }
    const now = new Date();
    const mine = events.filter((e) => e.creator_id === profile.id);
    const joined = events.filter((e) => e.is_joined);
    // Dedupe by id when computing the "past" bucket. The creator
    // auto-joins their own event at create time, so anything they
    // hosted also appears in `joined` — `[...mine, ...joined]` would
    // hand the FlatList two children with the same key and React
    // threw "Encountered two children with the same key" errors on
    // every past event.
    const pastById = new Map<string, EventWithCreator>();
    for (const e of mine) if (isEventPast(e, now)) pastById.set(e.id, e);
    for (const e of joined) if (isEventPast(e, now)) pastById.set(e.id, e);
    return {
      hostingCount: mine.length,
      attendingCount: joined.filter((e) => e.creator_id !== profile.id).length,
      hosting: mine.filter((e) => !isEventPast(e, now)),
      attending: joined.filter(
        (e) => e.creator_id !== profile.id && !isEventPast(e, now),
      ),
      past: Array.from(pastById.values()).sort((a, b) =>
        `${b.event_date}T${b.event_time}`.localeCompare(
          `${a.event_date}T${a.event_time}`,
        ),
      ),
    };
  }, [events, profile]);

  // ── Swipe between tabs ────────────────────────────────────────────
  // Everything below is hooks, so it has to stay above the guest and
  // no-profile returns further down.
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;

  // The pan handlers are built once and never rebuilt, so they read the
  // things that change through refs rather than closing over a stale
  // first render.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const widthRef = useRef(width);
  widthRef.current = width;

  // Only the panel dims as it travels; a straight slide with no fade
  // reads as the list being dragged rather than swapped.
  const fade = useMemo(
    () =>
      slide.interpolate({
        inputRange: [-width, 0, width],
        outputRange: [0.25, 1, 0.25],
        extrapolate: 'clamp',
      }),
    [slide, width],
  );

  const pan = useRef(
    PanResponder.create({
      // No onStart handler: taps have to reach the rows underneath.
      // Claiming only once a drag is clearly sideways is what keeps this
      // from stealing the vertical scroll — 1.6 is enough of a margin
      // that a slightly diagonal flick down the list still scrolls.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_e, g) => {
        const i = TABS.indexOf(tabRef.current);
        const beyondStart = i === 0 && g.dx > 0;
        const beyondEnd = i === TABS.length - 1 && g.dx < 0;
        if (beyondStart || beyondEnd) {
          const sign = g.dx > 0 ? 1 : -1;
          slide.setValue(sign * Math.min(Math.abs(g.dx) * EDGE_RESIST, EDGE_MAX));
        } else {
          slide.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_e, g) => {
        const i = TABS.indexOf(tabRef.current);
        const w = widthRef.current;
        // Swiping left (negative dx) means "forward", the way pages go.
        const dir = g.dx < 0 ? 1 : -1;
        const next = i + dir;
        const committed =
          Math.abs(g.dx) > w * SWIPE_TRIGGER || Math.abs(g.vx) > SWIPE_VELOCITY;

        if (committed && next >= 0 && next < TABS.length) {
          // Carry the outgoing panel the rest of the way off, swap the
          // data behind it, then bring the incoming one in from the
          // opposite edge. Two steps, so the swap is never visible.
          Animated.timing(slide, {
            toValue: -dir * w,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished) return;
            setTab(TABS[next]!);
            slide.setValue(dir * w);
            settle();
          });
          return;
        }
        // Everything else comes home: a drag too short to count, and
        // every attempt at the two ends.
        settle();
      },
      onPanResponderTerminate: () => settle(),
    }),
  ).current;

  function settle() {
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    }).start();
  }

  const panelStyle = { transform: [{ translateX: slide }], opacity: fade };

  const list: (EventWithCreator | UserReview)[] =
    tab === 'reviews'
      ? reviews
      : tab === 'hosting'
        ? hosting
        : tab === 'attending'
          ? attending
          : past;

  // `navigate`, not `push`: pushing a tab route stacks a second copy of
  // the tab navigator — and a second live MapView — over the one that
  // is already mounted.
  const openOnMap = (event: EventWithCreator) => {
    focusEvent(event.id);
    router.navigate('/(tabs)/map');
  };

  // Every hook above has already run: this refusal has to sit below
  // them or the screen would break the rules of hooks the first
  // time a guest opens it. It also has to precede the "no profile
  // yet" state below, which is for a signed-in account still
  // loading and offers no way to sign in.
  if (isGuest) return <GuestGate reason="profile" />;

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="👤"
          title={t('profile.noProfile')}
          description={t('profile.noProfileHint')}
        />
      </SafeAreaView>
    );
  }

  const interests = (profile.interests ?? [])
    .map((k) => INTERESTS_BY_KEY[k])
    .filter((i): i is NonNullable<typeof i> => !!i);



  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="gap-5 px-5 pt-2 pb-4">
            {/* Header row — the one way to Settings.
                It used to be reachable twice: this button and another in
                the action row below, which left the row with three equal
                thirds and no primary. The button stays here rather than
                there because settings is a destination, not something
                you do to your profile — and it is a gear now, not an
                ellipsis. "…" means "more", which was a promise this
                button never kept: it only ever went to one place. */}
            <View className="flex-row items-center justify-end">
              <Pressable
                onPress={() => router.navigate('/settings')}
                accessibilityLabel={t('profile.settings')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
              >
                <Ionicons name="settings-outline" size={18} color={iconColor} />
              </Pressable>
            </View>

            {/* Identity block */}
            <View className="flex-row items-center gap-4">
              <Avatar name={profile.display_name} uri={profile.avatar_url} size="xl" />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className="shrink font-display text-3xl leading-tight text-text-light dark:text-text-dark"
                    numberOfLines={1}
                  >
                    {profile.display_name}
                  </Text>
                  <VerifiedBadge role={profile.role} size={18} />
                </View>
                <Text
                  className="text-sm text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  @{profile.username}
                </Text>
              </View>
            </View>

            {/* Actions — 60/40, not thirds.
                Three equal buttons made Edit profile primary by fill
                alone, which is a weak signal at a glance and no signal
                at all in monochrome. Width says it louder than colour
                does, and it costs nothing. */}
            <View className="flex-row gap-2">
              <View style={{ flex: 3 }}>
                <PrimaryButton
                  label={t('profile.editProfile')}
                  onPress={() => router.navigate('/profile-edit')}
                  fullWidth
                />
              </View>
              <View style={{ flex: 2 }}>
                <PrimaryButton
                  label={t('profile.friends')}
                  variant="secondary"
                  leftIcon={
                    <Ionicons name="people-outline" size={14} color={iconColor} />
                  }
                  onPress={() => router.navigate('/friends')}
                  fullWidth
                />
              </View>
            </View>

            {/* Stats — always four.
                The rating arrives from its own request, and rendering
                the tile only once it landed meant three tiles widened
                to fill the row and then snapped back to four when it
                did. The slot is held from the first frame and shows a
                dash until there is a number to put in it. */}
            <View className="flex-row items-stretch gap-3">
              <StatTile
                value={rating}
                pending={rating == null}
                label={t('profile.statRating')}
              />
              <StatTile value={hostingCount} label={t('profile.statEvents')} />
              <StatTile value={attendingCount} label={t('profile.statAttending')} />
              <StatTile value={past.length} label={t('profile.statPast')} />
            </View>

            {/* Bio */}
            {profile.bio ? (
              <Text className="text-[15px] leading-snug text-text-light dark:text-text-dark">
                {profile.bio}
              </Text>
            ) : null}

            {/* Interest chips */}
            {interests.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {interests.map((i) => (
                  <View
                    key={i.key}
                    className="flex-row items-center gap-1.5 rounded-xl border border-border-light bg-panel-light px-2.5 py-1.5 dark:border-border-dark dark:bg-panel-dark"
                  >
                    <Text style={{ fontSize: 12 }}>{i.emoji}</Text>
                    <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark">
                      {t(i.labelKey)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Segmented control — and the top of the swipe zone.
                The gesture is attached from here down rather than to
                the whole screen: above this line sit the avatar, the
                buttons, the stats and the interests, none of which
                belong to a particular tab, so a sideways drag across
                them changing tab was the screen answering a question
                that part of it was not being asked. */}
            <View
              {...pan.panHandlers}
              className="flex-row items-center gap-6 border-b border-border-light dark:border-border-dark"
            >
              <SegmentTab
                label={t('profile.tabHosting', { n: hosting.length })}
                active={tab === 'hosting'}
                onPress={() => setTab('hosting')}
              />
              <SegmentTab
                label={t('profile.tabAttending', { n: attending.length })}
                active={tab === 'attending'}
                onPress={() => setTab('attending')}
              />
              <SegmentTab
                label={t('profile.tabPast')}
                active={tab === 'past'}
                onPress={() => setTab('past')}
              />
              <SegmentTab
                label={t('profile.tabReviews', { n: reviews.length })}
                active={tab === 'reviews'}
                onPress={() => setTab('reviews')}
              />
            </View>
          </View>
        }
        contentContainerStyle={{ padding: 20, gap: 12, paddingTop: 4, flexGrow: 1 }}
        // The rows travel, the header above them does not: the avatar,
        // the stats and the tab strip belong to all four panels, and
        // sliding them sideways would say the whole page changed when
        // only the list did.
        renderItem={({ item }) => (
          <Animated.View style={panelStyle} {...pan.panHandlers}>
            {tab === 'reviews' ? (
              <ReviewCard review={item as UserReview} />
            ) : (
              <EventCard
                event={item as EventWithCreator}
                // Past events have no pin left to fly to, so they open a
                // recap rather than the map.
                onPress={() =>
                  tab === 'past'
                    ? setPastEvent(item as EventWithCreator)
                    : openOnMap(item as EventWithCreator)
                }
              />
            )}
          </Animated.View>
        )}
        // Wrapped too, or an empty tab would sit dead still while a
        // populated one slides — and three of the four are empty for
        // most people, which is exactly when the gesture most needs to
        // show it did something.
        ListEmptyComponent={
          <Animated.View style={[panelStyle, { flexGrow: 1 }]} {...pan.panHandlers}>
          {tab === 'reviews' ? (
            <EmptyState
              emoji="📝"
              title={t('profile.noReviews')}
              description={t('profile.noReviewsHint')}
            />
          ) : (
            <EmptyState
              emoji={tab === 'hosting' ? '📍' : tab === 'attending' ? '🙋' : '🗓️'}
              title={
                tab === 'hosting'
                  ? t('profile.emptyHosting')
                  : tab === 'attending'
                    ? t('profile.emptyAttending')
                    : t('profile.emptyPast')
              }
              description={
                tab === 'past'
                  ? t('profile.emptyPastHint')
                  : t('profile.emptyHostingHint')
              }
              actionLabel={t('events.openMap')}
              onAction={() => router.navigate('/(tabs)/map')}
            />
          )}
          </Animated.View>
        }
      />

      <PastEventSheet event={pastEvent} onClose={() => setPastEvent(null)} />
    </SafeAreaView>
  );
}

function StatTile({
  value,
  label,
  pending = false,
}: {
  value: number | string | null;
  label: string;
  /** Waiting on the number. Holds the slot, shows a dash. */
  pending?: boolean;
}) {
  return (
    // px-3, down from px-4. Four tiles across 400pt of content with 12pt
    // gaps leave about 91pt each; the old horizontal padding spent 32 of
    // those on nothing, and the label had 59pt to fit a word that needs
    // more. Three points back on each side is most of the shortfall.
    <View className="flex-1 rounded-2xl border border-border-light bg-panel-light px-3 py-3 dark:border-border-dark dark:bg-panel-dark">
      <Text
        numberOfLines={1}
        className={[
          'font-display text-2xl leading-none',
          pending
            ? 'text-muted-light dark:text-muted-dark'
            : 'text-text-light dark:text-text-dark',
        ].join(' ')}
      >
        {pending ? '—' : value}
      </Text>
      {/* numberOfLines is the part that matters. "ATTENDING" wrapped to
          "ATTENDI / NG", and a label free to wrap will always find a
          word long enough to break on — a longer translation, a wider
          font, a narrower phone. One line, and shrink a little rather
          than truncate, so the guard holds for labels nobody has
          written yet. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light"
      >
        {label}
      </Text>
    </View>
  );
}

function SegmentTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="pb-3 pt-1">
      <View
        className={[
          'border-b-2',
          active ? 'border-text-light dark:border-text-dark' : 'border-transparent',
        ].join(' ')}
      >
        <Text
          className={[
            'text-sm font-semibold pb-2',
            active
              ? 'text-text-light dark:text-text-dark'
              : 'text-muted-light',
          ].join(' ')}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
