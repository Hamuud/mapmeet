import { useEffect, useState } from 'react';

import { geocodingService } from '@/services/geocoding.service';
import type { EventWithCreator } from '@/types';

/** Session cache for reverse-geocoded venue labels — Nominatim allows
 *  ~1 req/s, so never ask twice for the same event. */
const venueCache = new Map<string, string | null>();

/** Human-readable venue for an event. Prefers the stored `address`
 *  (what the host picked in the search); falls back to a one-shot
 *  reverse geocode for events created before the column existed. */
export function useVenue(event: EventWithCreator | null): string | null {
  const [venue, setVenue] = useState<string | null>(
    event ? (event.address ?? venueCache.get(event.id) ?? null) : null,
  );

  useEffect(() => {
    if (!event) {
      setVenue(null);
      return;
    }
    if (event.address) {
      setVenue(event.address);
      return;
    }
    if (venueCache.has(event.id)) {
      setVenue(venueCache.get(event.id) ?? null);
      return;
    }
    let cancelled = false;
    geocodingService
      .reverse({ latitude: event.latitude, longitude: event.longitude })
      .then((label) => {
        venueCache.set(event.id, label);
        if (!cancelled) setVenue(label);
      })
      .catch(() => {
        venueCache.set(event.id, null);
      });
    return () => {
      cancelled = true;
    };
  }, [event, event?.id, event?.address]);

  return venue;
}
