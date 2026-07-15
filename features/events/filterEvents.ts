import { distanceKm } from '@/utils/distance';
import { excludePast } from '@/utils/eventTime';
import type { EventFilter, EventWithCreator, LatLng } from '@/types';

/** Default nearby-filter radius when no viewer preference is passed. */
const DEFAULT_NEARBY_KM = 5;

/** Local UTC-day helper — event_date is stored as a plain date so we
 *  compare against the viewer's calendar day, not the server's. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function today(): string {
  return dayKey(new Date());
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dayKey(d);
}

function endOfWeek(): string {
  // Rolling 7-day window is what users mean by "this week", not the ISO week.
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return dayKey(d);
}

type FilterInput = {
  events: EventWithCreator[];
  viewerId: string | null;
  filter: EventFilter;
  query: string;
  coords: LatLng | null;
  /** Radius (km) used by the Nearby filter. Sourced from the user's
   *  preferences store when the map calls in; falls back to a sane
   *  default so unit-test callers don't have to plumb it through. */
  nearbyRadiusKm?: number;
};

export function filterEvents({
  events,
  viewerId,
  filter,
  query,
  coords,
  nearbyRadiusKm = DEFAULT_NEARBY_KM,
}: FilterInput): EventWithCreator[] {
  const t = today();
  const tm = tomorrow();
  const eow = endOfWeek();

  // Past events (start + 1h grace) never render on the map — they're
  // only useful to the creator, in their "Past" list. Stripping here
  // means every downstream filter branch stays past-free.
  let out = excludePast(events);

  switch (filter) {
    case 'today':
      out = out.filter((e) => e.event_date === t);
      break;
    case 'tomorrow':
      out = out.filter((e) => e.event_date === tm);
      break;
    case 'week':
      out = out.filter((e) => e.event_date >= t && e.event_date <= eow);
      break;
    case 'nearby':
      if (!coords) return [];
      out = out
        .map((e) => ({
          event: e,
          km: distanceKm(coords, { latitude: e.latitude, longitude: e.longitude }),
        }))
        .filter(({ km }) => km <= nearbyRadiusKm)
        .sort((a, b) => a.km - b.km)
        .map(({ event }) => event);
      break;
    case 'joined':
      out = out.filter((e) => e.is_joined);
      break;
    case 'created':
      out = viewerId ? out.filter((e) => e.creator_id === viewerId) : [];
      break;
    case 'all':
    default:
      break;
  }

  const raw = query.trim().toLowerCase();
  if (raw) {
    // "#coffee" scopes the search to tags only; otherwise we match tags
    // as one of the searchable fields alongside title/emoji/creator.
    if (raw.startsWith('#')) {
      const tagQ = raw.slice(1);
      if (tagQ) {
        out = out.filter((e) => e.tags.some((t) => t.includes(tagQ)));
      }
    } else {
      out = out.filter(
        (e) =>
          e.title.toLowerCase().includes(raw) ||
          e.emoji.includes(raw) ||
          e.creator.display_name.toLowerCase().includes(raw) ||
          e.creator.username.toLowerCase().includes(raw) ||
          e.tags.some((t) => t.includes(raw)),
      );
    }
  }

  return out;
}
