// MapMeet — the contract every event source implements.
//
// Adding a new country/site means writing one module that exports an
// `EventSource` and registering it in `registry.ts` (plus a row in the
// public.event_sources table). Nothing downstream — geocoding, the
// ingest RPC, the cron, the app — needs to know which site it came from.

/** The categories we import, and the marker emoji each one gets. */
export type EventCategory = 'concert' | 'festival' | 'theatre';

export const CATEGORY_EMOJI: Record<EventCategory, string> = {
  concert: '🎤',
  festival: '🎫',
  theatre: '🎭',
};

/** Human tag written alongside the location tag, per category. Kept in
 *  the source's own language where the audience is local. */
export const CATEGORY_TAG: Record<EventCategory, string> = {
  concert: 'концерт',
  festival: 'фестиваль',
  theatre: 'театр',
};

/** Inclusive date window (local wall dates, `YYYY-MM-DD`). */
export type DateWindow = {
  from: string;
  to: string;
};

/** One event as published by the source, before geocoding. Wall-clock
 *  date/time are kept exactly as the site states them — an event at
 *  19:00 in Kyiv must read "19:00", never shifted into UTC. */
export type ScrapedEvent = {
  /** Stable external identifier — the canonical event URL. Upsert key. */
  sourceId: string;
  title: string;
  description: string;
  category: EventCategory;
  /** Local wall date `YYYY-MM-DD` and time `HH:MM`. */
  date: string;
  time: string;
  /** Venue as the source names it, e.g. "Національна філармонія України". */
  venueName: string;
  /** Full street address, when published. */
  streetAddress: string | null;
  /** City / locality — the location tag and the geocode fallback. */
  city: string | null;
  /** Where to buy tickets (falls back to the event page). */
  ticketUrl: string;
  /** Poster. Stored on the event; shown in the peek. */
  imageUrl: string | null;
};

export type EventSource = {
  /** Must match public.event_sources.id. */
  id: string;
  /** ISO-3166-1 alpha-2, for logging/inspection. */
  country: string;
  /** Fetch every listed event starting inside `window`. */
  fetchEvents: (window: DateWindow, log: (msg: string) => void) => Promise<ScrapedEvent[]>;
};
