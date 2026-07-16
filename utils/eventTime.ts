import type { EventWithCreator } from '@/types';

/** How long after start we still treat an event as "live" on the map. */
export const EVENT_GRACE_MINUTES = 60;

/** Combines an event's `event_date` (YYYY-MM-DD) and `event_time`
 *  (HH:MM or HH:MM:SS) into a JS Date interpreted in the viewer's local
 *  timezone — same interpretation the create/edit sheet uses when the
 *  user picks the date + time. */
export function eventStart(event: {
  event_date: string;
  event_time: string;
}): Date | null {
  const [y, m, d] = event.event_date.split('-').map(Number);
  const [hh, mm] = event.event_time.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True once the event's start time plus the grace period is in the
 *  past. Used to hide the pin from the map for everyone and shuffle
 *  the event into the creator's "Past" list.
 *
 *  Grace lets late arrivals still see + join right up to the meetup,
 *  and covers events that run a bit long (a coffee at 16:30 is still
 *  "live" at 17:20 — the pin disappears at 17:30). */
export function isEventPast(
  event: { event_date: string; event_time: string },
  now: Date = new Date(),
  graceMinutes: number = EVENT_GRACE_MINUTES,
): boolean {
  const start = eventStart(event);
  if (!start) return false; // bad data → treat as live rather than orphan it
  const cutoff = start.getTime() + graceMinutes * 60_000;
  return now.getTime() > cutoff;
}

/** Minutes before the archive cutoff at which we warn the chat. */
export const ARCHIVE_WARNING_MINUTES = 30;

/** True while the event is inside the window `[archiveAt - 30min,
 *  archiveAt)` — i.e. the chat is about to move to Archive. Used to
 *  post the one-time "this chat archives soon" system message. Since
 *  `archiveAt = start + grace` (60min), this window is `start+30min`
 *  to `start+60min`. */
export function isArchiveWarningDue(
  event: { event_date: string; event_time: string },
  now: Date = new Date(),
): boolean {
  const start = eventStart(event);
  if (!start) return false;
  const archiveAt = start.getTime() + EVENT_GRACE_MINUTES * 60_000;
  const warnAt = archiveAt - ARCHIVE_WARNING_MINUTES * 60_000;
  const t = now.getTime();
  return t >= warnAt && t < archiveAt;
}

/** Convenience: strip past events out of any list. */
export function excludePast<T extends { event_date: string; event_time: string }>(
  events: T[],
  now?: Date,
): T[] {
  const clock = now ?? new Date();
  return events.filter((e) => !isEventPast(e, clock));
}

/** Convenience: keep only past events. */
export function onlyPast<T extends EventWithCreator>(events: T[], now?: Date): T[] {
  const clock = now ?? new Date();
  return events.filter((e) => isEventPast(e, clock));
}
