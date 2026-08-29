import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { JUMP_THRESHOLD } from '@/components/chat/JumpToLatest';
import { useUnreadBoundary } from '@/components/chat/UnreadDivider';
import { useTyping } from '@/hooks/useTyping';
import { muteKey, mutesService, type MuteScope } from '@/services/mutes.service';
import type { MessageWithSender } from '@/types';

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

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const away = y > JUMP_THRESHOLD;
    if (away !== scrolledAwayRef.current) {
      scrolledAwayRef.current = away;
      setScrolledAway(away);
      // Coming back to the bottom clears the tally; that is what the
      // button was counting towards.
      if (!away) setMissed(0);
    }
  }, []);

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
    showJump: scrolledAway,
    missedCount: missed,
    onScroll,
    jumpToLatest,
  };
}
