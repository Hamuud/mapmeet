// MapMeet — address → coordinates for imported events.
//
// Sources publish addresses, not coordinates, so every imported event
// needs a lookup. Two rules shape this file:
//
//   1. PRECISION DECIDES THE MARKER. If we resolve the actual venue we
//      pin it. If we only resolve the city we must NOT pin it — a
//      marker on the city centroid is a lie about where to show up.
//      Those events still get coordinates so "Nearby" can answer "is
//      this near me?", and the app hides them from the map.
//
//   2. BE CHEAP AND POLITE. Nominatim's policy is ~1 request/second and
//      no bulk hammering. Venues repeat heavily across events (one hall,
//      twenty concerts), so every lookup — including failures — is
//      cached in public.geocode_cache. After the first run a week's
//      ingest is mostly cache hits.

import { restGet, restPost } from './db.ts';

export type Precision = 'venue' | 'city' | 'none';

export type GeoResult = {
  latitude: number;
  longitude: number;
  precision: Exclude<Precision, 'none'>;
} | null;

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA =
  'MapMeetBot/1.0 (+https://github.com/Hamuud/mapmeet; community event map; contact via repo)';
const RATE_LIMIT_MS = 1100; // Nominatim: max ~1 req/s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + RATE_LIMIT_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** Nominatim classes that mean "this is a settlement, not a venue". A
 *  hit on one of these for a street query means the street wasn't found
 *  and we were handed the town instead — that's city precision. */
const CITY_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'administrative',
  'county',
  'state',
  'region',
  'suburb',
  'neighbourhood',
]);

type NominatimRow = {
  lat: string;
  lon: string;
  class?: string;
  type?: string;
};

async function lookup(query: string): Promise<{ row: NominatimRow; precision: Precision } | null> {
  await throttle();
  const url = `${NOMINATIM}?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'uk' },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let rows: NominatimRow[];
  try {
    rows = (await res.json()) as NominatimRow[];
  } catch {
    return null;
  }
  const row = rows[0];
  if (!row) return null;
  const isSettlement =
    row.class === 'boundary' || (row.class === 'place' && CITY_TYPES.has(row.type ?? ''));
  return { row, precision: isSettlement ? 'city' : 'venue' };
}

// In-process memo on top of the DB cache: within one run the same venue
// shows up many times and shouldn't cost even a SELECT.
const memo = new Map<string, GeoResult>();

async function cacheGet(query: string): Promise<GeoResult | undefined> {
  if (memo.has(query)) return memo.get(query);
  const rows = await restGet<
    Array<{ latitude: number | null; longitude: number | null; precision: Precision }>
  >(`geocode_cache?query=eq.${encodeURIComponent(query)}&select=latitude,longitude,precision`);
  const hit = rows?.[0];
  if (!hit) return undefined;
  const value: GeoResult =
    hit.precision === 'none' || hit.latitude == null || hit.longitude == null
      ? null
      : { latitude: hit.latitude, longitude: hit.longitude, precision: hit.precision };
  memo.set(query, value);
  return value;
}

async function cachePut(query: string, value: GeoResult) {
  memo.set(query, value);
  await restPost(
    'geocode_cache?on_conflict=query',
    {
      query,
      latitude: value?.latitude ?? null,
      longitude: value?.longitude ?? null,
      precision: value?.precision ?? 'none',
    },
    { Prefer: 'resolution=merge-duplicates' },
  );
}

async function resolve(query: string, want: Exclude<Precision, 'none'>): Promise<GeoResult> {
  const cached = await cacheGet(query);
  if (cached !== undefined) return cached;

  const hit = await lookup(query);
  let value: GeoResult = null;
  if (hit) {
    const lat = Number(hit.row.lat);
    const lon = Number(hit.row.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      // A street query that resolved to a settlement is city precision,
      // never venue — that's the whole point of the check.
      const precision = want === 'venue' && hit.precision === 'venue' ? 'venue' : 'city';
      value = { latitude: lat, longitude: lon, precision };
    }
  }
  await cachePut(query, value);
  return value;
}

/** Best-effort coordinates for one event's venue.
 *
 *  Tries the full street address (→ 'venue'), then the city alone
 *  (→ 'city', map-suppressed). Returns null when neither resolves, in
 *  which case the caller skips the event entirely: with no coordinates
 *  it can't be placed on the map OR answered for in Nearby. */
export async function geocodeVenue(input: {
  streetAddress: string | null;
  venueName: string;
  city: string | null;
  country: string;
}): Promise<GeoResult> {
  const { streetAddress, venueName, city, country } = input;

  if (streetAddress) {
    const hit = await resolve(streetAddress, 'venue');
    if (hit?.precision === 'venue') return hit;
  }

  // Named venues are often mapped as POIs even when the street line is
  // messy ("Палац культури «ТИТАН»" resolves where the address doesn't).
  if (venueName && city) {
    const hit = await resolve(`${venueName}, ${city}, ${country}`, 'venue');
    if (hit?.precision === 'venue') return hit;
  }

  if (city) {
    const hit = await resolve(`${city}, ${country}`, 'city');
    if (hit) return { ...hit, precision: 'city' };
  }

  return null;
}
