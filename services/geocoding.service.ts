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

export const geocodingService = {
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
