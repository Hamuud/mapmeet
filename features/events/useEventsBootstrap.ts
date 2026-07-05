import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useEventsStore } from '@/store/events.store';

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

  // Initial fetch + realtime subscription.
  useEffect(() => {
    if (!viewerId) {
      reset();
      return;
    }
    void fetch(viewerId);
    const unsubscribe = subscribe(viewerId);
    return () => {
      unsubscribe();
    };
  }, [viewerId, fetch, subscribe, reset]);

  // Foreground refetch — covers the case where iOS parked the WebSocket
  // (or the network flapped) and we've missed events while inactive.
  useEffect(() => {
    if (!viewerId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void fetch(viewerId);
      }
    });
    return () => sub.remove();
  }, [viewerId, fetch]);
}
