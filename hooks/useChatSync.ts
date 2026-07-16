import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { messagesService } from '@/services/messages.service';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useEventsStore } from '@/store/events.store';
import { isArchiveWarningDue } from '@/utils/eventTime';

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

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const idsKey = chats
    .map((c) => c.id)
    .sort()
    .join(',');

  // Warnings already dispatched this session — the DB flag is the real
  // guard against duplicates, this just avoids spamming the RPC.
  const warnedRef = useRef<Set<string>>(new Set());

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

    const channel = supabase
      .channel('mapmeet:chat:badge')
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
      .subscribe();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        doRefresh();
        runArchiveWarnings();
      }
    });

    const heartbeat = setInterval(() => {
      doRefresh();
      runArchiveWarnings();
    }, 60_000);

    return () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
      appSub.remove();
    };
  }, [viewerId, refresh, runArchiveWarnings]);
}
