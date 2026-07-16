import type { LatLng } from '@/types';

/** Address-lookup result from Nominatim. `label` is what we show in the
 *  autocomplete list; `coords` is what we pin. */
export type GeocodeResult = {
  label: string;
  coords: LatLng;
};

/** OpenStreetMap's public geocoder. No API key required — but usage is
 *  capped at ~1 req/sec and the Referer header MUST identify the app
 *  (browsers set this automatically). If we outgrow this we'll swap in
 *  Mapbox or MapTiler, both of which take a drop-in API key. */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

export const geocodingService = {
  /** Coords → short venue label. Used as a display fallback for events
   *  created before the `address` column existed. zoom=17 answers at
   *  building/POI granularity; we trim the display_name to its first
   *  two comma segments so "Library, Main St" doesn't drag the whole
   *  region hierarchy behind it. */
  async reverse(coords: LatLng, signal?: AbortSignal): Promise<string | null> {
    const url =
      `${NOMINATIM_REVERSE}?format=json&zoom=17` +
      `&lat=${coords.latitude}&lon=${coords.longitude}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
      signal,
    });
    if (!res.ok) return null;
    const row = (await res.json()) as { display_name?: string };
    if (!row.display_name) return null;
    return row.display_name.split(',').slice(0, 2).join(',').trim();
  },

  async search(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const url = `${NOMINATIM}?format=json&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim asks for a descriptive User-Agent, but browsers refuse
        // to let us set it — Accept-Language is the best we can offer.
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
      signal,
    });
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const rows = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return rows.map((row) => ({
      label: row.display_name,
      coords: {
        latitude: Number(row.lat),
        longitude: Number(row.lon),
      },
    }));
  },
};
