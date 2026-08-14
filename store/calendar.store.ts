import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** What we wrote, and what it looked like when we wrote it.
 *
 *  `signature` is how the reconciler answers "has anything changed?"
 *  without reading the calendar back on every pass — the device
 *  calendar is not a cheap thing to query, and the host moving an event
 *  is rare compared to the store changing. */
export type SyncedEntry = {
  calendarEventId: string;
  signature: string;
};

type CalendarState = {
  /** MapMeet event id → the entry we created on this device. */
  entries: Record<string, SyncedEntry>;
  remember: (eventId: string, entry: SyncedEntry) => void;
  forget: (eventId: string) => void;
  /** Wipe the map without touching the calendar — used when the user
   *  switches the feature off, after the entries have been removed. */
  clear: () => void;
};

/** Device-local, and it has to be: a calendar event id means nothing on
 *  any other phone, so this cannot live on the profile. Persisted
 *  because losing it would orphan every entry we ever created — we'd
 *  have no handle to update or delete them by. */
export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      entries: {},
      remember: (eventId, entry) =>
        set((s) => ({ entries: { ...s.entries, [eventId]: entry } })),
      forget: (eventId) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[eventId];
          return { entries: next };
        }),
      clear: () => set({ entries: {} }),
    }),
    {
      name: 'mapmeet-calendar-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
