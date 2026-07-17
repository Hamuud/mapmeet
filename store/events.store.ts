import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';

import { eventsService, type Bbox } from '@/services/events.service';
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

  /** Sticky set: events pinned in the app + imported events the viewer
   *  joined. Loaded once, kept regardless of where the map points. */
  _base: EventWithCreator[];
  /** Transient set: imported events for the region currently on screen.
   *  Replaced wholesale on every viewport change. */
  _viewport: EventWithCreator[];

  _channel: RealtimeChannel | null;
  _viewerId: string | null;

  fetch: (viewerId: string | null) => Promise<void>;
  /** Load imported events for a visible region. Cheap to call often —
   *  the map debounces it. */
  syncViewport: (bbox: Bbox, viewerId: string | null) => Promise<void>;
  subscribe: (viewerId: string | null) => () => void;

  upsertEvent: (event: EventWithCreator) => void;
  removeEvent: (id: string) => void;
  patchEvent: (id: string, patch: Partial<EventWithCreator>) => void;

  selectEvent: (id: string | null) => void;
  focusEvent: (id: string | null) => void;
  reset: () => void;
};

/** Flatten the two sets into what the UI reads. Base wins on conflict:
 *  it carries the viewer's own membership state. */
function merge(
  base: EventWithCreator[],
  viewport: EventWithCreator[],
): EventWithCreator[] {
  const byId = new Map<string, EventWithCreator>();
  for (const e of viewport) byId.set(e.id, e);
  for (const e of base) byId.set(e.id, e);
  return [...byId.values()];
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  status: 'idle',
  error: null,
  selectedEventId: null,
  focusedEventId: null,
  _base: [],
  _viewport: [],
  _channel: null,
  _viewerId: null,

  fetch: async (viewerId) => {
    set({ status: 'loading', error: null, _viewerId: viewerId });
    try {
      const [mine, joinedExternal] = await Promise.all([
        eventsService.list(viewerId),
        viewerId ? eventsService.listJoinedExternal(viewerId) : Promise.resolve([]),
      ]);
      const base = merge(mine, joinedExternal);
      set({ _base: base, events: merge(base, get()._viewport), status: 'ready' });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Failed to load events.',
      });
    }
  },

  syncViewport: async (bbox, viewerId) => {
    try {
      const viewport = await eventsService.listExternalInBbox(viewerId, bbox);
      set({ _viewport: viewport, events: merge(get()._base, viewport) });
    } catch {
      // A failed viewport fetch (offline, flaky pan) must not blank the
      // map — keep whatever is already on screen.
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
          const row = payload.new as { id: string; source?: string };
          // The weekly ingest inserts hundreds of imported events at
          // once. Realtime would push every one of them into every
          // client, undoing the whole point of loading by viewport — so
          // only accept imported rows we already track.
          const isExternal = !!row.source && row.source !== 'user';
          const known = get().events.some((e) => e.id === row.id);
          if (isExternal && !known) return;

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
          const isJoinPayload = payload.eventType !== 'DELETE';
          const current = get().events.find((e) => e.id === eventId);
          if (!current) return;

          // Viewer's own join/leave: `handleJoinToggle` (and the
          // creator's auto-join at create time) already flipped
          // `is_joined` + bumped `participant_count` optimistically.
          // Re-applying the delta here would double-count — inflating
          // the participants row on the joiner's own screen while
          // everyone else's screen (which never ran an optimistic
          // path) stayed correct.
          //
          // Use `is_joined` as an idempotency marker: if it already
          // matches this payload, we've applied it locally. If it
          // doesn't (e.g. the viewer joined from another device or
          // session), apply the delta so cross-device state
          // converges.
          const isOwnAction = !!viewerId && userId === viewerId;
          const alreadyApplied = isOwnAction && current.is_joined === isJoinPayload;
          if (alreadyApplied) return;

          const patch: Partial<EventWithCreator> = {
            participant_count: Math.max(
              0,
              current.participant_count + (isJoinPayload ? 1 : -1),
            ),
          };
          if (isOwnAction) patch.is_joined = isJoinPayload;
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
      // Update in place wherever it already lives; new events join the
      // sticky set (user events) or stay transient (imported).
      const inViewport = state._viewport.some((e) => e.id === event.id);
      if (inViewport) {
        const viewport = state._viewport.map((e) => (e.id === event.id ? event : e));
        return { _viewport: viewport, events: merge(state._base, viewport) };
      }
      const idx = state._base.findIndex((e) => e.id === event.id);
      const base =
        idx === -1
          ? [...state._base, event]
          : state._base.map((e) => (e.id === event.id ? event : e));
      return { _base: base, events: merge(base, state._viewport) };
    }),

  removeEvent: (id) =>
    set((state) => {
      const base = state._base.filter((e) => e.id !== id);
      const viewport = state._viewport.filter((e) => e.id !== id);
      return {
        _base: base,
        _viewport: viewport,
        events: merge(base, viewport),
        selectedEventId: state.selectedEventId === id ? null : state.selectedEventId,
      };
    }),

  patchEvent: (id, patch) =>
    set((state) => {
      const apply = (list: EventWithCreator[]) =>
        list.map((e) => (e.id === id ? { ...e, ...patch } : e));

      // Joining an imported event promotes it out of the transient set:
      // once you're in, it has to survive panning away (it's your chat
      // and your My Events row now).
      const viewportHit = state._viewport.find((e) => e.id === id);
      if (patch.is_joined === true && viewportHit) {
        const base = [...state._base, { ...viewportHit, ...patch }];
        const viewport = state._viewport.filter((e) => e.id !== id);
        return { _base: base, _viewport: viewport, events: merge(base, viewport) };
      }

      const base = apply(state._base);
      const viewport = apply(state._viewport);
      return { _base: base, _viewport: viewport, events: merge(base, viewport) };
    }),

  selectEvent: (id) => set({ selectedEventId: id }),
  focusEvent: (id) => set({ focusedEventId: id }),

  reset: () => {
    const ch = get()._channel;
    if (ch) supabase.removeChannel(ch);
    set({
      events: [],
      _base: [],
      _viewport: [],
      status: 'idle',
      error: null,
      selectedEventId: null,
      focusedEventId: null,
      _channel: null,
      _viewerId: null,
    });
  },
}));
