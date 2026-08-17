import { create } from 'zustand';

import { eventsService } from '@/services/events.service';

type SavedState = {
  /** Event ids the viewer has bookmarked. A record rather than a Set so
   *  a component subscribing to one id doesn't re-render on every other
   *  change to the collection. */
  ids: Record<string, true>;
  status: 'idle' | 'loading' | 'ready';
  load: (viewerId: string | null) => Promise<void>;
  /** Optimistic; rolls back if the write fails. Returns the state it
   *  ended up in so the caller can phrase a toast. */
  toggle: (eventId: string, viewerId: string) => Promise<boolean>;
  isSaved: (eventId: string) => boolean;
  reset: () => void;
};

/** Bookmarks, as ids only.
 *
 *  The event rows themselves live in the events store — loaded into its
 *  sticky set the same way joined events are — so there is exactly one
 *  copy of any given event in memory and no chance of the Saved tab
 *  showing a stale title. This store answers one question: is this
 *  saved? */
export const useSavedStore = create<SavedState>((set, get) => ({
  ids: {},
  status: 'idle',

  load: async (viewerId) => {
    if (!viewerId) {
      set({ ids: {}, status: 'ready' });
      return;
    }
    set({ status: 'loading' });
    try {
      const ids = await eventsService.listSavedIds(viewerId);
      const next: Record<string, true> = {};
      for (const id of ids) next[id] = true;
      set({ ids: next, status: 'ready' });
    } catch {
      // A failed load must not read as "nothing is saved" — that would
      // show empty bookmarks and tempt the user into re-saving. Keep
      // whatever we had.
      set({ status: 'ready' });
    }
  },

  toggle: async (eventId, viewerId) => {
    const wasSaved = !!get().ids[eventId];
    set((s) => {
      const ids = { ...s.ids };
      if (wasSaved) delete ids[eventId];
      else ids[eventId] = true;
      return { ids };
    });
    try {
      if (wasSaved) await eventsService.unsave(eventId, viewerId);
      else await eventsService.save(eventId, viewerId);
      return !wasSaved;
    } catch (e) {
      set((s) => {
        const ids = { ...s.ids };
        if (wasSaved) ids[eventId] = true;
        else delete ids[eventId];
        return { ids };
      });
      throw e;
    }
  },

  isSaved: (eventId) => !!get().ids[eventId],
  reset: () => set({ ids: {}, status: 'idle' }),
}));
