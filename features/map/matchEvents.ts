import { excludePast } from '@/utils/eventTime';
import type { EventWithCreator } from '@/types';

/** Below this the query is too vague to rank usefully — "f" matches half
 *  the map. */
const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 6;

/** Lowercase, strip accents, collapse whitespace. `Кава` and `кава`
 *  match; so do `Café` and `cafe`. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How well an event answers this query. 0 means it doesn't.
 *
 *  The tiers matter more than the numbers: a title that *starts* with
 *  what you typed should beat one that merely contains it somewhere, and
 *  both should beat a tag match — otherwise typing "fest" puts an event
 *  tagged #festival above one actually called "Food fest". */
function score(event: EventWithCreator, q: string): number {
  const title = norm(event.title);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  // Any word in the title starting with the query: "fest" finds
  // "Food fest", which is the case that started all this.
  if (title.split(' ').some((w) => w.startsWith(q))) return 60;
  if (title.includes(q)) return 40;
  if (Array.isArray(event.tags) && event.tags.some((t) => norm(t).startsWith(q))) {
    return 20;
  }
  if (norm(event.creator?.display_name ?? '').startsWith(q)) return 10;
  return 0;
}

/** Events whose name looks like what someone is typing.
 *
 *  This replaced a list of geocoded addresses under the search box. The
 *  addresses answered "where is this place", which is not what anyone
 *  types into an events app — they type half the name of a thing they
 *  half remember, and want the thing.
 *
 *  Past events are dropped: suggesting something that already happened
 *  is a worse answer than suggesting nothing. */
export function suggestEvents(
  events: EventWithCreator[],
  query: string,
  limit = MAX_SUGGESTIONS,
): EventWithCreator[] {
  const q = norm(query);
  if (q.length < MIN_CHARS) return [];

  return excludePast(events)
    .map((event) => ({ event, s: score(event, q) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) =>
      // Best match first; ties broken by whichever happens soonest, so
      // "several festivals" arrive in the order you could actually go to
      // them.
      b.s !== a.s
        ? b.s - a.s
        : `${a.event.event_date}T${a.event.event_time}`.localeCompare(
            `${b.event.event_date}T${b.event.event_time}`,
          ),
    )
    .slice(0, limit)
    .map(({ event }) => event);
}

/** Titles that appear more than once in a set of suggestions.
 *
 *  Three events called "Food fest" are indistinguishable by name, which
 *  is exactly when the venue stops being clutter and becomes the only
 *  way to tell them apart — so the row shows it for these and nothing
 *  else. */
export function ambiguousTitles(events: EventWithCreator[]): Set<string> {
  const seen = new Map<string, number>();
  for (const e of events) {
    const key = norm(e.title);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
