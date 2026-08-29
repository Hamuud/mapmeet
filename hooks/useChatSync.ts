import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { messagesService } from '@/services/messages.service';
import { openChannel } from '@/services/realtime';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useEventsStore } from '@/store/events.store';
import { isArchiveWarningDue, isComingPollDue } from '@/utils/eventTime';

/** Keeps the chat store's previews + unread total fresh, and fires the
 *  one-time archive warning when an event nears its cutoff.
 *
 *  Mounted once in the tabs layout so it lives for the whole authed
 *  session. Refreshes on: chat-set change, any realtime message
 *  INSERT/UPDATE (debounced — a read receipt updates read_by, which is
 *  how the badge drops when you open a chat), app foreground, and a
 *  60-second heartbeat (so the archive warning can fire even in a
 *  silent chat). */
export function useChatSync() {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user.id ?? null;
  const events = useEventsStore((s) => s.events);
  const refresh = useChatStore((s) => s.refresh);

  // Full chat-event objects (need times + archive_warned for the
  // warning check, not just ids).
  const chats = useMemo(() => {
    if (!viewerId) return [];
    return events.filter((e) => e.creator_id === viewerId || e.is_joined);
  }, [events, viewerId]);

  const refreshDirect = useChatStore((s) => s.refreshDirect);
  const resetChat = useChatStore((s) => s.reset);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const idsKey = chats
    .map((c) => c.id)
    .sort()
    .join(',');

  // Warnings already dispatched this session — the DB flag is the real
  // guard against duplicates, this just avoids spamming the RPC.
  const warnedRef = useRef<Set<string>>(new Set());
  const comingPollRef = useRef<Set<string>>(new Set());

  const runArchiveWarnings = useMemo(
    () => () => {
      const now = new Date();
      for (const e of chatsRef.current) {
        // `archive_warned === false` is an explicit signal the column
        // exists (migration applied). If it's undefined the feature
        // isn't live yet — skip rather than call a missing RPC.
        if (
          e.archive_warned === false &&
          !warnedRef.current.has(e.id) &&
          isArchiveWarningDue(e, now)
        ) {
          warnedRef.current.add(e.id);
          void messagesService.postArchiveWarning(e.id).catch(() => {
            // RPC missing / already warned — drop the local guard so a
            // later attempt can retry if it was a transient failure.
            warnedRef.current.delete(e.id);
          });
        }

        // Automatic "Who's coming?" poll in the hour before start. Same
        // one-shot pattern; the DB flag (coming_poll_created) is the real
        // dedup guard across clients.
        if (
          e.coming_poll_created === false &&
          !comingPollRef.current.has(e.id) &&
          isComingPollDue(e, now)
        ) {
          comingPollRef.current.add(e.id);
          void messagesService.ensureComingPoll(e.id).catch(() => {
            comingPollRef.current.delete(e.id);
          });
        }
      }
    },
    [],
  );

  // Refresh previews whenever the set of chats changes.
  useEffect(() => {
    if (!viewerId) return;
    void refresh(
      chatsRef.current.map((c) => c.id),
      viewerId,
    );
    runArchiveWarnings();
  }, [idsKey, viewerId, refresh, runArchiveWarnings]);

  // Direct rooms, loaded here rather than on the Chat screen.
  //
  // They used to be fetched by that screen when its Direct segment was
  // picked, which is why a DM could not reach the tab badge: nothing
  // had loaded it. Signing out clears them, so the next account does
  // not inherit a badge counting somebody else's messages.
  useEffect(() => {
    if (!viewerId) {
      resetChat();
      return;
    }
    void refreshDirect(viewerId);
  }, [viewerId, refreshDirect, resetChat]);

  // Realtime + foreground + heartbeat.
  useEffect(() => {
    if (!viewerId) return;
    let timer: ReturnType<typeof setTimeout>;
    const doRefresh = () =>
      void refresh(
        chatsRef.current.map((c) => c.id),
        viewerId,
      );
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(doRefresh, 600);
    };

    let directTimer: ReturnType<typeof setTimeout>;
    const doRefreshDirect = () => void refreshDirect(viewerId);
    const debouncedDirect = () => {
      clearTimeout(directTimer);
      directTimer = setTimeout(doRefreshDirect, 600);
    };

    // One channel, three tables. dm_messages and group_messages are new
    // here, and they are the reason a direct message now shows up
    // without being gone looking for: the Direct list used to reload
    // only when its segment was tapped, so a DM sat invisible until
    // somebody happened to open the right folder.
    //
    // No filter on these. postgres_changes runs under RLS, so what
    // arrives is already only the rooms this viewer belongs to — and
    // the payload is thrown away regardless, since all we do with it is
    // decide to refetch.
    const channel = openChannel('mapmeet:chat:badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        debounced,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        debounced,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_messages' },
        debouncedDirect,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_messages' },
        debouncedDirect,
      )
      .subscribe();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        doRefresh();
        doRefreshDirect();
        runArchiveWarnings();
      }
    });

    const heartbeat = setInterval(() => {
      doRefresh();
      doRefreshDirect();
      runArchiveWarnings();
    }, 60_000);

    return () => {
      clearTimeout(timer);
      clearTimeout(directTimer);
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
      appSub.remove();
    };
  }, [viewerId, refresh, refreshDirect, runArchiveWarnings]);
}
