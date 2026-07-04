import type { LatLng } from '@/types';

export type TravelMode = 'driving' | 'walking' | 'cycling';

export type Route = {
  geometry: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  mode: TravelMode;
};

/** OSRM's public demo server. Free, no key, but the ToS asks not to build
 *  production traffic on top of it — swap the base URL for a self-hosted
 *  or paid instance (Mapbox, GraphHopper, Valhalla) if we outgrow it. */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

/** OSRM's demo host only ships the `driving` profile. Walking + cycling
 *  fall back to driving there — for real walking/cycling routing point
 *  this at a self-hosted or Mapbox endpoint. */
const OSRM_PROFILE: Record<TravelMode, string> = {
  driving: 'driving',
  walking: 'driving',
  cycling: 'driving',
};

type OsrmResponse = {
  code: string;
  routes: Array<{
    distance: number; // meters
    duration: number; // seconds
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }>;
};

export const routingService = {
  async route(
    from: LatLng,
    to: LatLng,
    mode: TravelMode = 'driving',
    signal?: AbortSignal,
  ): Promise<Route> {
    const profile = OSRM_PROFILE[mode];
    const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Routing failed (${res.status})`);
    const data = (await res.json()) as OsrmResponse;
    if (data.code !== 'Ok' || !data.routes[0]) {
      throw new Error('No route found.');
    }
    const route = data.routes[0];
    return {
      mode,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      })),
    };
  },
};
