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
): ClusterPoint[] {
  const index = useMemo(() => {
    const idx = new Supercluster<EventFeature['properties']>({
      // Bigger grouping radius + minPoints 2 so even TWO nearby events
      // merge into one cluster circle instead of rendering as two
      // overlapping pins (which is what "two microphones stacked on
      // Brovary" was). The rotating-emoji circle is the whole point of a
      // cluster, so we want it to kick in as early as a pair.
      radius: 80,
      maxZoom: 18,
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

  return useMemo(() => {
    if (!region) {
      return events.map<ClusterPoint>((event) => ({
        kind: 'point',
        id: event.id,
        event,
        coordinate: { latitude: event.latitude, longitude: event.longitude },
      }));
    }

    const zoom = zoomFromRegion(region);
    const clusters = index.getClusters(regionBBox(region), zoom);

    return clusters.map<ClusterPoint>((c) => {
      const [lng, lat] = c.geometry.coordinates;
      const props = c.properties as {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
        eventId?: string;
      };
      if (props.cluster && props.cluster_id != null) {
        const clusterId = props.cluster_id;
        return {
          kind: 'cluster',
          id: `cluster-${clusterId}`,
          count: props.point_count ?? 0,
          coordinate: { latitude: lat!, longitude: lng! },
          expansionZoom: Math.min(index.getClusterExpansionZoom(clusterId), 18),
          leaves: () =>
            index
              .getLeaves(clusterId, Infinity)
              .map((leaf) => eventsById.get(leaf.properties.eventId)!)
              .filter(Boolean),
        };
      }
      const eventId = props.eventId!;
      const event = eventsById.get(eventId);
      // Defensive: if the id vanished between index build + cluster fetch
      // (extremely unlikely, but nice to be safe), silently drop it.
      if (!event) {
        return {
          kind: 'point',
          id: eventId,
          event: {
            id: eventId,
            latitude: lat!,
            longitude: lng!,
          } as unknown as EventWithCreator,
          coordinate: { latitude: lat!, longitude: lng! },
        };
      }
      return {
        kind: 'point',
        id: eventId,
        event,
        coordinate: { latitude: lat!, longitude: lng! },
      };
    });
  }, [events, region, index, eventsById]);
}
