import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { JUMP_THRESHOLD } from '@/components/chat/JumpToLatest';
import { dayKey } from '@/components/chat/FloatingDate';
import { useUnreadBoundary } from '@/components/chat/UnreadDivider';
import { useTyping } from '@/hooks/useTyping';
import { muteKey, mutesService, type MuteScope } from '@/services/mutes.service';
import type { MessageWithSender } from '@/types';

/** Rooms whose date pill has already had its one free showing this
 *  session. Module-level on purpose: it has to outlive the screen, and
 *  it has to NOT outlive the app — "first time you open this chat"
 *  means first time since launch, not first time ever. Persisting it
 *  would mean the pill never greeted you again on any device, which is
 *  more memory than the feature deserves. */
const greeted = new Set<string>();

/** How long the pill lingers after scrolling stops. Long enough to read,
 *  short enough that it is gone before it becomes furniture. */
const DATE_LINGER_MS = 1400;

/** Everything the three chat rooms need on top of their messages, in one
 *  place.
 *
 *  Event, DM and group rooms are three files of roughly five hundred
 *  lines each that already differ more than they should. Adding four
 *  features to each by hand is how the group chat ends up without the
 *  one somebody forgot. So the shared behaviour — mute, typing,
 *  jump-to-latest, the unread boundary — lives here and each room wires
 *  it in the same handful of lines. */
export function useRoomExtras({
  scope,
  targetId,
  viewerId,
  displayName,
  messages,
  listRef,
}: {
  scope: MuteScope;
  targetId: string | null;
  viewerId: string | null;
  displayName: string;
  /** Oldest-first, as stored. */
  messages: MessageWithSender[];
  listRef: React.RefObject<FlatList<MessageWithSender> | null>;
}) {
  // ── Mute ──────────────────────────────────────────────────────────
  const [muted, setMuted] = useState(false);
  const [muteReady, setMuteReady] = useState(false);
  useEffect(() => {
    if (!targetId || !viewerId) return;
    let cancelled = false;
    mutesService
      .list()
      .then((keys) => {
        if (!cancelled) {
          setMuted(keys.has(muteKey(scope, targetId)));
          setMuteReady(true);
        }
      })
      .catch(() => {
        // Unknown reads as unmuted: the failure mode should be hearing
        // from a chat you silenced, not silence you never asked for.
        if (!cancelled) setMuteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, targetId, viewerId]);

  const toggleMute = useCallback(async () => {
    if (!targetId) return false;
    const next = !muted;
    // Optimistic: the switch answers instantly and rolls back if the
    // write fails, because a toggle that waits on a round trip feels
    // broken even when it works.
    setMuted(next);
    try {
      await mutesService.set(scope, targetId, next);
      return next;
    } catch (e) {
      setMuted(!next);
      throw e;
    }
  }, [muted, scope, targetId]);

  // ── Typing ────────────────────────────────────────────────────────
  const { typers, notifyTyping } = useTyping(
    targetId ? `${scope}:${targetId}` : null,
    viewerId,
    displayName,
  );

  // ── Unread boundary ───────────────────────────────────────────────
  const { firstUnreadId, unreadCount } = useUnreadBoundary(messages, viewerId);

  // ── Jump to latest ────────────────────────────────────────────────
  //
  // The lists are inverted, so offset 0 IS the newest message and
  // scrolling "down" through history increases it. That inversion is
  // also why this cannot just watch for the end of the list.
  const [scrolledAway, setScrolledAway] = useState(false);
  const scrolledAwayRef = useRef(false);
  const [missed, setMissed] = useState(0);
  const lastCount = useRef(messages.length);

  // ── Floating date ─────────────────────────────────────────────────
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [dateVisible, setDateVisible] = useState(false);
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealDate = useCallback(() => {
    setDateVisible(true);
    if (dateTimer.current) clearTimeout(dateTimer.current);
    dateTimer.current = setTimeout(() => setDateVisible(false), DATE_LINGER_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (dateTimer.current) clearTimeout(dateTimer.current);
    };
  }, []);

  // One free showing when the room is opened, so the first thing you see
  // is anchored in time without having to move. Second visit in the same
  // session gets nothing — by then you know where you are.
  useEffect(() => {
    if (!targetId || messages.length === 0) return;
    if (greeted.has(`${scope}:${targetId}`)) return;
    greeted.add(`${scope}:${targetId}`);
    setDateIso(messages[messages.length - 1]!.created_at);
    revealDate();
  }, [scope, targetId, messages, revealDate]);

  /** Which message sits at the top of the viewport. The lists are
   *  inverted, so the visually highest row is the LAST of the viewable
   *  items, not the first — reading them in array order would show the
   *  date of whatever is nearest the composer instead. */
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: MessageWithSender }> }) => {
      const top = viewableItems[viewableItems.length - 1]?.item;
      if (!top) return;
      setDateIso((prev) =>
        prev && dayKey(prev) === dayKey(top.created_at) ? prev : top.created_at,
      );
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      revealDate();
      const y = e.nativeEvent.contentOffset.y;
      const away = y > JUMP_THRESHOLD;
      if (away !== scrolledAwayRef.current) {
        scrolledAwayRef.current = away;
        setScrolledAway(away);
        // Coming back to the bottom clears the tally; that is what the
        // button was counting towards.
        if (!away) setMissed(0);
      }
    },
    [revealDate],
  );

  // Count what arrives while the reader is elsewhere. Only while away,
  // so a chat read in real time never shows a badge.
  useEffect(() => {
    const grew = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (grew > 0 && scrolledAwayRef.current) setMissed((n) => n + grew);
  }, [messages.length]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setMissed(0);
  }, [listRef]);

  return {
    muted,
    muteReady,
    toggleMute,
    typerNames: typers.map((x) => x.name).filter(Boolean),
    notifyTyping,
    firstUnreadId,
    unreadCount,
    dateIso,
    dateVisible,
    onViewableItemsChanged,
    viewabilityConfig,
    showJump: scrolledAway,
    missedCount: missed,
    onScroll,
    jumpToLatest,
  };
}
