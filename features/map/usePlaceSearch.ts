import { useEffect, useRef, useState } from 'react';

import { geocodingService, type GeocodeResult } from '@/services/geocoding.service';

/** Nominatim asks for no more than one request a second, and typing
 *  produces far more than that. */
const DEBOUNCE_MS = 450;
const MIN_CHARS = 3;
const MAX_RESULTS = 3;

/** Turn whatever is in the search box into places you can jump to.
 *
 *  Search used to match text against the events already loaded, which
 *  meant a neighbourhood, a city, or anywhere the viewer was not already
 *  looking simply had no answer. The geocoder was wired for the create
 *  flow all along; this points it at search too.
 *
 *  Runs alongside the text filter rather than replacing it — typing
 *  "coffee" should still match a coffee event, and typing "Lviv" should
 *  offer to take you to Lviv. */
export function usePlaceSearch(query: string) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  /** Set once a result is chosen, so the list collapses instead of
   *  re-offering the place you just went to. */
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();

    if (q.length < MIN_CHARS || dismissed) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      const ac = new AbortController();
      controller.current = ac;
      geocodingService
        .search(q, ac.signal)
        .then((rows) => {
          if (!ac.signal.aborted) setResults(rows.slice(0, MAX_RESULTS));
        })
        .catch(() => {
          // Offline, rate-limited, or aborted mid-flight. The text filter
          // is still working, so failing quietly is the right answer.
          if (!ac.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, dismissed]);

  // A new query re-arms the list after a previous pick.
  const queryRef = useRef(query);
  useEffect(() => {
    if (query !== queryRef.current) {
      queryRef.current = query;
      setDismissed(false);
    }
  }, [query]);

  useEffect(() => () => controller.current?.abort(), []);

  return {
    places: results,
    searching,
    /** Call after flying to a place, so the list gets out of the way. */
    dismiss: () => setDismissed(true),
  };
}
