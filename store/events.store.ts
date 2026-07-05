import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';

import { eventsService } from '@/services/events.service';
import { supabase } from '@/services/supabase';
import type { EventWithCreator } from '@/types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type EventsState = {
  events: EventWithCreator[];
  status: Status;
  error: string | null;
  /** Picked from the map — opens the EventPreviewSheet AND flies camera. */
  selectedEventId: string | null;
  /** Picked from a list ("View on map") — flies camera only. Cleared by
   *  the map screen after the fly-to lands, so re-entering the tab
   *  doesn't re-focus. */
  focusedEventId: string | null;

  _channel: RealtimeChannel | null;
  _viewerId: string | null;

  fetch: (viewerId: string | null) => Promise<void>;
  subscribe: (viewerId: string | null) => () => void;

  upsertEvent: (event: EventWithCreator) => void;
  removeEvent: (id: string) => void;
  patchEvent: (id: string, patch: Partial<EventWithCreator>) => void;

  selectEvent: (id: string | null) => void;
  focusEvent: (id: string | null) => void;
  reset: () => void;
};

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  status: 'idle',
  error: null,
  selectedEventId: null,
  focusedEventId: null,
  _channel: null,
  _viewerId: null,

  fetch: async (viewerId) => {
    set({ status: 'loading', error: null, _viewerId: viewerId });
    try {
      const events = await eventsService.list(viewerId);
      set({ events, status: 'ready' });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Failed to load events.',
      });
    }
  },

  subscribe: (viewerId) => {
    // Tear down a previous subscription — swapping viewers (sign-out /
    // sign-in) would otherwise leak the channel.
    const prev = get()._channel;
    if (prev) supabase.removeChannel(prev);

    const channel = supabase
      .channel('mapmeet:events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            get().removeEvent((payload.old as { id: string }).id);
            return;
          }
          const row = payload.new as { id: string };
          const enriched = await eventsService.getById(row.id, viewerId);
          if (enriched) get().upsertEvent(enriched);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          const eventId =
            payload.eventType === 'DELETE'
              ? (payload.old as { event_id: string }).event_id
              : (payload.new as { event_id: string }).event_id;
          const userId =
            payload.eventType === 'DELETE'
              ? (payload.old as { user_id: string }).user_id
              : (payload.new as { user_id: string }).user_id;
          const delta = payload.eventType === 'DELETE' ? -1 : 1;
          const patch: Partial<EventWithCreator> = {};
          const current = get().events.find((e) => e.id === eventId);
          if (!current) return;
          patch.participant_count = Math.max(0, current.participant_count + delta);
          if (viewerId && userId === viewerId) {
            patch.is_joined = payload.eventType !== 'DELETE';
          }
          get().patchEvent(eventId, patch);
        },
      )
      .subscribe();

    set({ _channel: channel, _viewerId: viewerId });
    return () => {
      supabase.removeChannel(channel);
      if (get()._channel === channel) set({ _channel: null });
    };
  },

  upsertEvent: (event) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === event.id);
      if (idx === -1) return { events: [...state.events, event] };
      const next = state.events.slice();
      next[idx] = event;
      return { events: next };
    }),

  removeEvent: (id) =>
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
      selectedEventId: state.selectedEventId === id ? null : state.selectedEventId,
    })),

  patchEvent: (id, patch) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const next = state.events.slice();
      next[idx] = { ...next[idx]!, ...patch };
      return { events: next };
    }),

  selectEvent: (id) => set({ selectedEventId: id }),
  focusEvent: (id) => set({ focusedEventId: id }),

  reset: () => {
    const ch = get()._channel;
    if (ch) supabase.removeChannel(ch);
    set({
      events: [],
      status: 'idle',
      error: null,
      selectedEventId: null,
      focusedEventId: null,
      _channel: null,
      _viewerId: null,
    });
  },
}));
