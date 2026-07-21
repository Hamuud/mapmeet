import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/events/EventCard';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { eventsService } from '@/services/events.service';
import {
  friendshipsService,
  type FriendshipState,
} from '@/services/friendships.service';
import { looksLikeUuid, profilesService } from '@/services/profiles.service';
import {
  ratingsService,
  type RatingSummary,
  type RatingVote,
  type UserReview,
} from '@/services/ratings.service';
import { supabase } from '@/services/supabase';
import { useEventsStore } from '@/store/events.store';
import { isEventPast } from '@/utils/eventTime';
import { formatRelativeTime } from '@/utils/format';
import { INTERESTS_BY_KEY } from '@/utils/interests';
import { goBack } from '@/utils/nav';
import { formatRating } from '@/utils/rating';
import type { EventWithCreator, Profile } from '@/types';

type Tab = 'upcoming' | 'past' | 'reviews';

/** Public read-only profile for a host. Reached from the "View
 *  <name>'s profile" button in the event peek and from chat avatars.
 *  Shows avatar / name / handle, the taxi-style rating with Like /
 *  Dislike voting, bio, interest chips, their events (Upcoming / Past)
 *  and a Reviews tab of anonymous feedback with a composer.
 *
 *  We already have every event in the store — no separate creator-
 *  events endpoint needed. Just filter locally. */
export default function UserProfileScreen() {
  // Route param name matches the file (`/user/[username].tsx`). We still
  // accept a UUID-shaped segment for the transition — profilesService
  // routes it to getById — and then quietly replace(...) the URL to the
  // pretty /user/<handle> form so the address bar stops leaking ids.
  const { username: handleParam } = useLocalSearchParams<{ username: string }>();
  const handle = (handleParam ?? '').trim();
  const toast = useToast();
  const { session } = useAuth();
  const events = useEventsStore((s) => s.events);
  const focusEvent = useEventsStore((s) => s.focusEvent);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('upcoming');

  // isSelf can only be answered after the profile row lands — the URL no
  // longer carries the viewer's uuid.
  const isSelf = !!(session && profile && session.user.id === profile.id);
  // Ratings/reviews RPCs take a uuid; use the resolved profile id, not
  // the URL segment.
  const targetId = profile?.id ?? null;

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    profilesService
      .getByHandle(handle)
      .then((row) => {
        if (cancelled) return;
        setProfile(row);
        // Landed via a legacy /user/<uuid> URL → swap the address bar
        // for /user/<username> so the id doesn't linger in someone's
        // history or share sheet.
        if (row && looksLikeUuid(handle) && row.username !== handle) {
          router.replace({
            pathname: '/user/[username]',
            params: { username: row.username },
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          toast.show(
            e instanceof Error ? e.message : 'Could not load profile',
            'error',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, toast]);

  // ── Friendship (viewer ↔ this profile) ────────────────────────────
  const [friendship, setFriendship] = useState<FriendshipState>('none');
  const [friendBusy, setFriendBusy] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const viewerId = session?.user.id ?? null;

  useEffect(() => {
    if (!viewerId || !targetId || isSelf) return;
    let cancelled = false;
    friendshipsService
      .getState(viewerId, targetId)
      .then((s) => {
        if (!cancelled) setFriendship(s);
      })
      .catch(() => {
        /* migration not applied yet — hide the buttons rather than
         * blocking the whole profile page */
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId, targetId, isSelf]);

  const handleFriendAction = useCallback(async () => {
    if (!viewerId || !targetId || friendBusy) return;
    // Removing an established friend is destructive — confirm first
    // instead of unfriending on a single tap.
    if (friendship === 'friends') {
      setConfirmUnfriend(true);
      return;
    }
    setFriendBusy(true);
    try {
      // Send-or-accept: the RPC auto-accepts an inbound pending
      // request when I click Add friend.
      await friendshipsService.request(targetId);
      setFriendship(await friendshipsService.getState(viewerId, targetId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update friendship', 'error');
    } finally {
      setFriendBusy(false);
    }
  }, [viewerId, targetId, friendBusy, friendship, toast]);

  const doUnfriend = useCallback(async () => {
    if (!viewerId || !targetId) return;
    setConfirmUnfriend(false);
    setFriendBusy(true);
    try {
      await friendshipsService.remove(targetId);
      setFriendship(await friendshipsService.getState(viewerId, targetId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update friendship', 'error');
    } finally {
      setFriendBusy(false);
    }
  }, [viewerId, targetId, toast]);

  // ── Rating + reviews ──────────────────────────────────────────────
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewSending, setReviewSending] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    ratingsService
      .getSummary(targetId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        /* rating hidden until the migration lands — non-fatal */
      });
    ratingsService
      .listReviews(targetId)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const handleVote = useCallback(
    async (value: RatingVote) => {
      if (!targetId || !summary || voteBusy) return;
      const prev = summary;
      // Optimistic: move the counts locally, roll back on failure.
      setSummary({
        likes: prev.likes - (prev.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0),
        dislikes:
          prev.dislikes - (prev.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0),
        myVote: value,
      });
      setVoteBusy(true);
      try {
        await ratingsService.rate(targetId, value);
      } catch (e) {
        setSummary(prev);
        toast.show(e instanceof Error ? e.message : 'Could not vote', 'error');
      } finally {
        setVoteBusy(false);
      }
    },
    [targetId, summary, voteBusy, toast],
  );

  const handleSubmitReview = useCallback(async () => {
    const text = reviewDraft.trim();
    if (!targetId || !text || reviewSending) return;
    setReviewSending(true);
    try {
      await ratingsService.addReview(targetId, text);
      setReviewDraft('');
      setReviews(await ratingsService.listReviews(targetId));
      toast.show('Review posted anonymously.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not post review', 'error');
    } finally {
      setReviewSending(false);
    }
  }, [targetId, reviewDraft, reviewSending, toast]);

  // Prefer events already in the store — they're enriched with
  // creator + participant_count. But a viewer arriving here without
  // having loaded the map yet won't have them, so fall back to a
  // one-shot fetch when the store is empty for this host.
  const [fallbackEvents, setFallbackEvents] = useState<EventWithCreator[]>([]);
  useEffect(() => {
    if (!targetId) return;
    const inStore = events.some((e) => e.creator_id === targetId);
    if (inStore || events.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data: authData } = await supabase.auth.getSession();
      const viewerId = authData.session?.user.id ?? null;
      try {
        const rows = await eventsService.list(viewerId);
        if (!cancelled) setFallbackEvents(rows);
      } catch {
        /* silent — the empty state will just show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, events]);

  const { upcoming, past } = useMemo(() => {
    if (!targetId) return { upcoming: [], past: [] };
    const src = events.length > 0 ? events : fallbackEvents;
    const now = new Date();
    const mine = src.filter((e) => e.creator_id === targetId);
    return {
      upcoming: mine.filter((e) => !isEventPast(e, now)),
      past: mine
        .filter((e) => isEventPast(e, now))
        .sort((a, b) =>
          `${b.event_date}T${b.event_time}`.localeCompare(
            `${a.event_date}T${a.event_time}`,
          ),
        ),
    };
  }, [events, fallbackEvents, targetId]);

  const list: (EventWithCreator | UserReview)[] =
    tab === 'reviews' ? reviews : tab === 'upcoming' ? upcoming : past;

  const openOnMap = (event: EventWithCreator) => {
    focusEvent(event.id);
    router.replace('/(tabs)/map');
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <Text className="text-sm text-muted-light">Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <Header onBack={() => goBack('/(tabs)/map')} title="Profile" />
        <EmptyState
          emoji="👤"
          title="Profile not found"
          description="This user may have deleted their account."
          actionLabel="Go back"
          onAction={() => goBack('/(tabs)/map')}
        />
      </SafeAreaView>
    );
  }

  const interests = (profile.interests ?? [])
    .map((k) => INTERESTS_BY_KEY[k])
    .filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <Header onBack={() => goBack('/(tabs)/map')} title={`@${profile.username}`} />

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 12, paddingTop: 4, flexGrow: 1 }}
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            {/* Identity */}
            <View className="flex-row items-center gap-4">
              <Avatar name={profile.display_name} uri={profile.avatar_url} size="xl" />
              <View className="flex-1">
                <Text
                  className="font-display text-3xl leading-tight text-text-light dark:text-text-dark"
                  numberOfLines={1}
                >
                  {profile.display_name}
                </Text>
                <Text
                  className="text-sm text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  @{profile.username}
                </Text>
              </View>
            </View>

            {/* Friendship + DM buttons — hidden on your own profile,
                and while not signed in. Add friend / Requested /
                Accept / Friends map onto the four FriendshipStates. */}
            {!isSelf && session ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label={
                      friendship === 'friends'
                        ? 'Friends ✓'
                        : friendship === 'outgoing'
                          ? 'Requested'
                          : friendship === 'incoming'
                            ? 'Accept request'
                            : 'Add friend'
                    }
                    variant={friendship === 'friends' ? 'secondary' : 'primary'}
                    leftIcon={
                      <Ionicons
                        name={
                          friendship === 'friends'
                            ? 'people'
                            : friendship === 'outgoing'
                              ? 'time-outline'
                              : 'person-add-outline'
                        }
                        size={14}
                        color={
                          friendship === 'friends'
                            ? '#4B5FE0'
                            : '#F6F4EE'
                        }
                      />
                    }
                    loading={friendBusy}
                    onPress={handleFriendAction}
                    fullWidth
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Message"
                    variant="secondary"
                    leftIcon={
                      <Ionicons name="chatbubble-outline" size={14} color="#4B5FE0" />
                    }
                    onPress={() =>
                      router.navigate({
                        pathname: '/dm/[username]',
                        params: { username: profile.username },
                      })
                    }
                    fullWidth
                  />
                </View>
              </View>
            ) : null}

            {/* Rating — everyone starts at 5.00; likes/dislikes from
                other users move it. Voting hidden on your own profile. */}
            {summary ? (
              <RatingCard
                summary={summary}
                canVote={!isSelf && !!session}
                busy={voteBusy}
                onVote={handleVote}
              />
            ) : null}

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
                      {i.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Segmented: events + reviews */}
            <View className="flex-row items-center gap-6 border-b border-border-light dark:border-border-dark">
              <SegmentTab
                label={`Upcoming · ${upcoming.length}`}
                active={tab === 'upcoming'}
                onPress={() => setTab('upcoming')}
              />
              <SegmentTab
                label={`Past · ${past.length}`}
                active={tab === 'past'}
                onPress={() => setTab('past')}
              />
              <SegmentTab
                label={`Reviews · ${reviews.length}`}
                active={tab === 'reviews'}
                onPress={() => setTab('reviews')}
              />
            </View>

            {/* Anonymous review composer — not on your own profile. */}
            {tab === 'reviews' && !isSelf && session ? (
              <View className="gap-2 rounded-2xl border border-border-light bg-panel-light p-3 dark:border-border-dark dark:bg-panel-dark">
                <TextInput
                  value={reviewDraft}
                  onChangeText={setReviewDraft}
                  placeholder="Share your experience — it's posted anonymously"
                  placeholderTextColor="#8B8880"
                  multiline
                  maxLength={500}
                  className="min-h-[60px] text-[14px] text-text-light outline-none dark:text-text-dark"
                  style={{ textAlignVertical: 'top' }}
                />
                <PrimaryButton
                  label="Post anonymously"
                  size="sm"
                  variant="secondary"
                  leftIcon={
                    <Ionicons name="eye-off-outline" size={13} color="#4B5FE0" />
                  }
                  disabled={!reviewDraft.trim() || reviewSending}
                  loading={reviewSending}
                  onPress={handleSubmitReview}
                  fullWidth
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          tab === 'reviews' ? (
            <ReviewCard review={item as UserReview} />
          ) : (
            <EventCard
              event={item as EventWithCreator}
              onPress={() => openOnMap(item as EventWithCreator)}
            />
          )
        }
        ListEmptyComponent={
          tab === 'reviews' ? (
            <EmptyState
              emoji="📝"
              title="No reviews yet"
              description={
                isSelf
                  ? 'Feedback others leave about you will show up here.'
                  : `Be the first to leave ${profile.display_name} an anonymous review.`
              }
            />
          ) : (
            <EmptyState
              emoji={tab === 'upcoming' ? '📍' : '🗓️'}
              title={
                tab === 'upcoming'
                  ? 'Nothing on the calendar right now'
                  : 'No past events'
              }
              description={
                tab === 'upcoming'
                  ? `${profile.display_name} hasn't scheduled anything upcoming.`
                  : 'Older events they hosted will show up here.'
              }
            />
          )
        }
      />

      <ConfirmationDialog
        open={confirmUnfriend}
        title={`Remove ${profile.display_name} from friends?`}
        message="You'll both stop being friends and lose unlimited messaging. You can add them again later."
        confirmLabel="Remove"
        destructive
        onConfirm={doUnfriend}
        onCancel={() => setConfirmUnfriend(false)}
      />
    </SafeAreaView>
  );
}

/** ★ score + vote counts on the left, thumbs-up / thumbs-down on the
 *  right. Tapping your current vote again withdraws it (vote 0). */
function RatingCard({
  summary,
  canVote,
  busy,
  onVote,
}: {
  summary: RatingSummary;
  canVote: boolean;
  busy: boolean;
  onVote: (value: RatingVote) => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-border-light bg-panel-light px-4 py-3 dark:border-border-dark dark:bg-panel-dark">
      <View>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="star" size={16} color="#E68A5E" />
          <Text className="font-display text-2xl leading-none text-text-light dark:text-text-dark">
            {formatRating(summary.likes, summary.dislikes)}
          </Text>
        </View>
        <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
          {summary.likes} {summary.likes === 1 ? 'like' : 'likes'} ·{' '}
          {summary.dislikes} {summary.dislikes === 1 ? 'dislike' : 'dislikes'}
        </Text>
      </View>
      {canVote ? (
        <View className="flex-row gap-2">
          <VoteButton
            icon="thumbs-up"
            active={summary.myVote === 1}
            activeClass="bg-brand-500"
            disabled={busy}
            label={summary.myVote === 1 ? 'Remove like' : 'Like this user'}
            onPress={() => onVote(summary.myVote === 1 ? 0 : 1)}
          />
          <VoteButton
            icon="thumbs-down"
            active={summary.myVote === -1}
            activeClass="bg-red-500"
            disabled={busy}
            label={summary.myVote === -1 ? 'Remove dislike' : 'Dislike this user'}
            onPress={() => onVote(summary.myVote === -1 ? 0 : -1)}
          />
        </View>
      ) : null}
    </View>
  );
}

function VoteButton({
  icon,
  active,
  activeClass,
  disabled,
  label,
  onPress,
}: {
  icon: 'thumbs-up' | 'thumbs-down';
  active: boolean;
  activeClass: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const iconColor = useIconColor();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={[
        'h-10 w-10 items-center justify-center rounded-full border',
        active
          ? `${activeClass} border-transparent`
          : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
      ].join(' ')}
    >
      <Ionicons
        name={active ? icon : `${icon}-outline`}
        size={16}
        color={active ? '#fff' : iconColor}
      />
    </Pressable>
  );
}

/** One anonymous review row for the Reviews tab. */
function ReviewCard({ review }: { review: UserReview }) {
  return (
    <View className="gap-1.5 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="person-circle-outline" size={14} color="#8B8880" />
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            Anonymous
          </Text>
        </View>
        <Text className="font-mono text-[9px] uppercase text-muted-light">
          {formatRelativeTime(review.created_at)}
        </Text>
      </View>
      <Text className="text-[14px] leading-snug text-text-light dark:text-text-dark">
        {review.text}
      </Text>
    </View>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  const iconColor = useIconColor();
  return (
    <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back"
        hitSlop={10}
        className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
      >
        <Ionicons name="chevron-back" size={18} color={iconColor} />
      </Pressable>
      <Text className="text-lg font-bold text-text-light dark:text-text-dark">
        {title}
      </Text>
      <View className="h-9 w-9" />
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
            active ? 'text-text-light dark:text-text-dark' : 'text-muted-light',
          ].join(' ')}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
