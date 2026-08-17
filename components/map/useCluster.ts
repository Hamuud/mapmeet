import Supercluster from 'supercluster';
import { useMemo } from 'react';

import type { EventWithCreator, LatLng } from '@/types';

export type ClusterPoint =
  | {
      kind: 'point';
      id: string;
      event: EventWithCreator;
      coordinate: LatLng;
    }
  | {
      kind: 'cluster';
      id: string;
      count: number;
      coordinate: LatLng;
      /** supercluster expansion pass-through so tapping a cluster can zoom in. */
      leaves: () => EventWithCreator[];
      expansionZoom: number;
    };

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

function zoomFromRegion(region: Region): number {
  const zoom = Math.round(Math.log2(360 / region.longitudeDelta));
  return Math.max(1, Math.min(20, zoom));
}

/** Everything, for callers that must not let the camera decide which
 *  events exist at all. */
const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

/** Zoom to assume before the camera has reported a region. Matches the
 *  initial zoom both maps open at, so the first frame clusters the same
 *  way the second one will. */
const DEFAULT_ZOOM = 13;

function regionBBox(region: Region): [number, number, number, number] {
  const minLng = region.longitude - region.longitudeDelta;
  const maxLng = region.longitude + region.longitudeDelta;
  const minLat = region.latitude - region.latitudeDelta;
  const maxLat = region.latitude + region.latitudeDelta;
  return [minLng, minLat, maxLng, maxLat];
}

type EventFeature = {
  type: 'Feature';
  properties: { eventId: string };
  geometry: { type: 'Point'; coordinates: [number, number] };
};

/** Returns clustered points for the current visible region. Native-only —
 *  the web map uses MapLibre's own clustering.
 *
 *  The supercluster index and the id→event lookup are built inside
 *  useMemo (synchronously) rather than a useEffect. The effect-based
 *  version created a subtle bug: on the very first render with real
 *  events, useMemo ran before the new index was ready and returned
 *  clusters from the stale (empty) index. React doesn't re-render on
 *  ref updates, so markers stayed invisible until an unrelated state
 *  change (e.g. tapping a filter) forced another render pass. */
export function useCluster(
  events: EventWithCreator[],
  region: Region | null,
  options?: {
    /** Cluster the whole set rather than only what the camera can see.
     *
     *  The web map needs this. Its markers are DOM nodes it owns, and
     *  before clustering moved here it built one for every event, full
     *  stop — so an event in Ternopil stayed in the document while you
     *  looked at Kyiv and reappeared when you zoomed out. Filtering by
     *  the camera box took that away: events outside it were rendered on
     *  the first frame (no region yet), then deleted the moment the
     *  region arrived. They flashed once on open and vanished.
     *
     *  Native leaves this off: it mounts a real <Marker> per point, and
     *  there the viewport filter is what keeps that number sane. */
    worldBounds?: boolean;
  },
): ClusterPoint[] {
  const index = useMemo(() => {
    const idx = new Supercluster<EventFeature['properties']>({
      // Bigger grouping radius + minPoints 2 so even TWO nearby events
      // merge into one cluster circle instead of rendering as two
      // overlapping pins (which is what "two microphones stacked on
      // Brovary" was). The rotating-emoji circle is the whole point of a
      // cluster, so we want it to kick in as early as a pair.
      radius: 80,
      // Above this supercluster hands back loose points, and events at
      // an identical coordinate then stack into one unreachable pile.
      // zoomFromRegion clamps the query to 20, so 22 means clustering
      // never switches off at any zoom this map can reach — matching
      // the web source, which had the same ceiling and showed the bug
      // first because its camera goes further in.
      maxZoom: 22,
      minPoints: 2,
    });
    const features: EventFeature[] = events.map((e) => ({
      type: 'Feature',
      properties: { eventId: e.id },
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
    }));
    idx.load(features);
    return idx;
  }, [events]);

  const eventsById = useMemo(() => {
    const m = new Map<string, EventWithCreator>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  const worldBounds = options?.worldBounds ?? false;

  return useMemo(() => {
    // No region yet means the camera has not reported in — not that
    // clustering should be skipped. Returning loose points here was what
    // made coincident pins overlap for the one frame before the region
    // landed, and on web it also meant the next frame deleted whatever
    // fell outside the box.
    const zoom = region ? zoomFromRegion(region) : DEFAULT_ZOOM;
    const bbox = !region || worldBounds ? WORLD_BBOX : regionBBox(region);
    const clusters = index.getClusters(bbox, zoom);

    return clusters.flatMap<ClusterPoint>((c) => {
      const [lng, lat] = c.geometry.coordinates;
      const props = c.properties as {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
        eventId?: string;
      };
      if (props.cluster && props.cluster_id != null) {
        const clusterId = props.cluster_id;
        return [{
          kind: 'cluster' as const,
          id: `cluster-${clusterId}`,
          count: props.point_count ?? 0,
          coordinate: { latitude: lat!, longitude: lng! },
          expansionZoom: Math.min(index.getClusterExpansionZoom(clusterId), 18),
          leaves: () =>
            index
              .getLeaves(clusterId, Infinity)
              .map((leaf) => eventsById.get(leaf.properties.eventId)!)
              .filter(Boolean),
        }];
      }
      const eventId = props.eventId!;
      const event = eventsById.get(eventId);
      // If the id vanished between index build and cluster fetch
      // (extremely unlikely, but possible), drop the point entirely.
      // The previous version returned a stub carrying only an id and a
      // coordinate — and the marker renderer reads `event.creator.role`
      // to resolve the pin style, so that stub threw on render. A throw
      // here takes the whole map screen down, which is a steep price for
      // one missing pin.
      if (!event) return [];
      return [{
        kind: 'point' as const,
        id: eventId,
        event,
        coordinate: { latitude: lat!, longitude: lng! },
      }];
    });
  }, [events, region, index, eventsById, worldBounds]);
}
