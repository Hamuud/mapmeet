import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useEventsStore } from '@/store/events.store';
import { useSavedStore } from '@/store/saved.store';

/** Fetches the events feed and opens a realtime subscription whenever
 *  the authenticated user changes. Also refetches on app foreground —
 *  Supabase Realtime's WebSocket occasionally drops on iOS (Simulator
 *  in particular), which used to leave the feed frozen until the app
 *  restarted. Re-hydrating on foreground gives us a rock-solid fallback
 *  without waiting on Realtime health. */
export function useEventsBootstrap() {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const fetch = useEventsStore((s) => s.fetch);
  const subscribe = useEventsStore((s) => s.subscribe);
  const reset = useEventsStore((s) => s.reset);
  const loadSaved = useSavedStore((s) => s.load);
  const resetSaved = useSavedStore((s) => s.reset);

  // Initial fetch + realtime subscription.
  //
  // A signed-out visitor still fetches: the map is the shop window, and
  // `eventsService.list(null)` reads the public projection instead of the
  // table. What they do NOT get is a realtime channel or bookmarks —
  // both need an account, and Realtime would just fail its auth
  // handshake in a retry loop.
  useEffect(() => {
    if (!viewerId) {
      resetSaved();
      void fetch(null);
      return;
    }
    void fetch(viewerId);
    // Bookmarks are ids only and load in one round trip; the rows they
    // point at arrive with the fetch above.
    void loadSaved(viewerId);
    const unsubscribe = subscribe(viewerId);
    return () => {
      unsubscribe();
    };
  }, [viewerId, fetch, subscribe, reset, resetSaved, loadSaved]);

  // Foreground refetch — covers the case where iOS parked the WebSocket
  // (or the network flapped) and we've missed events while inactive.
  // Guests have no socket to park, but they also have no other way to
  // notice new pins, so this is their only refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void fetch(viewerId);
      }
    });
    return () => sub.remove();
  }, [viewerId, fetch]);
}
