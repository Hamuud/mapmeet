import { t } from '@/i18n';
import type { LatLng } from '@/types';

const EARTH_RADIUS_KM = 6371;

/** Haversine great-circle distance in kilometers. Accurate enough for
 *  "nearby events" sorting; swap for PostGIS if we need server-side. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return t('distance.metres', { n: Math.round(km * 1000) });
  if (km < 10) return t('distance.km', { n: km.toFixed(1) });
  return t('distance.km', { n: Math.round(km) });
}
