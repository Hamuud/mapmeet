import { useEffect, useRef } from 'react';

import {
  addEvent,
  hasCalendarAccess,
  removeEvent,
  updateEvent,
} from '@/services/calendar.service';
import { useAuthStore } from '@/store/auth.store';
import { useCalendarStore } from '@/store/calendar.store';
import { useEventsStore } from '@/store/events.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { isEventPast } from '@/utils/eventTime';
import { calendarLocation, calendarTitle, type CalendarEventInput } from '@/utils/ics';

/** Everything that would make the calendar entry look different. */
function signatureOf(e: CalendarEventInput): string {
  return [
    calendarTitle(e),
    e.event_date,
    e.event_time,
    calendarLocation(e),
    e.description?.trim() ?? '',
  ].join('|');
}

/** Keeps the device calendar matching the events you have joined.
 *
 *  Declarative on purpose. The alternative — bolting a calendar call
 *  onto each of the three join/leave call sites — has to be got right
 *  four separate times, and still misses the two cases nobody triggers
 *  by hand: the host moving the event, and the host deleting it. Both of
 *  those arrive through the events store like everything else.
 *
 *  So this reconciles instead. On every change to the joined set it asks
 *  one question per event — should there be an entry, and does it match?
 *  — and one question per remembered entry: is this still something the
 *  user is going to?
 *
 *  Runs only while the preference is on and permission is granted, and
 *  no-ops entirely on web and on native builds made before expo-calendar
 *  landed. */
export function useCalendarSync() {
  const session = useAuthStore((s) => s.session);
  const events = useEventsStore((s) => s.events);
  const enabled = usePreferencesStore((s) => s.calendarSync);
  const entries = useCalendarStore((s) => s.entries);
  const remember = useCalendarStore((s) => s.remember);
  const forget = useCalendarStore((s) => s.forget);

  // One pass at a time. The store can change several times in a burst
  // (a realtime insert, then the participant count settling) and two
  // overlapping passes would both see "no entry yet" and create two.
  const running = useRef(false);
  // Read entries through a ref so the effect doesn't re-run on its own
  // writes — remember()/forget() change `entries`, which would otherwise
  // schedule another pass immediately.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    if (!session || !enabled || running.current) return;

    let cancelled = false;
    running.current = true;

    void (async () => {
      try {
        if (!(await hasCalendarAccess())) return;

        const known = entriesRef.current;
        // What deserves an entry: joined, and not already over. A past
        // event is left alone rather than deleted — it is a record of
        // where they were, and pulling it out from under them would be
        // rude.
        const wanted = events.filter((e) => e.is_joined && !isEventPast(e));
        const wantedIds = new Set(wanted.map((e) => e.id));

        for (const event of wanted) {
          if (cancelled) return;
          const existing = known[event.id];
          const signature = signatureOf(event);
          if (!existing) {
            const id = await addEvent(event);
            if (id && !cancelled) remember(event.id, { calendarEventId: id, signature });
            continue;
          }
          if (existing.signature === signature) continue;
          // The host moved it. Try to update in place; if the entry has
          // gone (deleted by hand) put a fresh one back, because the
          // user did ask for these.
          const ok = await updateEvent(existing.calendarEventId, event);
          if (cancelled) return;
          if (ok) {
            remember(event.id, { ...existing, signature });
          } else {
            const id = await addEvent(event);
            if (id && !cancelled) remember(event.id, { calendarEventId: id, signature });
            else forget(event.id);
          }
        }

        // Anything we created that is no longer in the joined set: they
        // left, or the host cancelled. Note this only considers events
        // the store actually knows about — an event that has simply
        // scrolled out of the loaded viewport keeps its entry, which is
        // the conservative choice when the alternative is deleting from
        // someone's calendar on incomplete information.
        const loadedIds = new Set(events.map((e) => e.id));
        for (const [eventId, entry] of Object.entries(known)) {
          if (cancelled) return;
          if (wantedIds.has(eventId)) continue;
          if (!loadedIds.has(eventId)) continue;
          await removeEvent(entry.calendarEventId);
          if (!cancelled) forget(eventId);
        }
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, enabled, events, remember, forget]);
}
