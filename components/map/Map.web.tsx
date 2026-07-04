import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { MapProps, MapRef, MapStyle } from './Map.types';
import type { EventWithCreator } from '@/types';

const STREETS_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

const TERRAIN_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    otm: {
      type: 'raster',
      tiles: [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        'Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)',
    },
  },
  layers: [{ id: 'otm', type: 'raster', source: 'otm' }],
};

const STYLE_FOR: Record<MapStyle, maplibregl.StyleSpecification> = {
  streets: STREETS_STYLE,
  satellite: SATELLITE_STYLE,
  terrain: TERRAIN_STYLE,
};

const SOURCE_ID = 'mapmeet-events';
const CLUSTER_LAYER_ID = 'mapmeet-clusters';
const CLUSTER_COUNT_LAYER_ID = 'mapmeet-cluster-count';
const ROUTE_SOURCE_ID = 'mapmeet-route';
const ROUTE_CASING_LAYER_ID = 'mapmeet-route-casing';
const ROUTE_LAYER_ID = 'mapmeet-route-line';
const LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCE_PX = 8;

function eventsToGeoJson(events: EventWithCreator[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      properties: { eventId: e.id, emoji: e.emoji, title: e.title },
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
    })),
  };
}

function routeToGeoJson(
  points: { latitude: number; longitude: number }[] | null | undefined,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: (points ?? []).map((p) => [p.longitude, p.latitude]),
    },
  };
}

/** Marker geometry as inline styles. Kept in one place so update-in-place
 *  in the effect below stays perfectly aligned with initial creation. */
function styleMarkerElement(
  el: HTMLDivElement,
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
) {
  const size = selected ? 56 : 48;
  el.style.cssText = `
    position:relative;
    width:${size}px;height:${size}px;border-radius:9999px;
    background:rgba(255,255,255,0.95);
    display:flex;align-items:center;justify-content:center;
    border:2px solid white;
    box-shadow:0 6px 16px rgba(0,0,0,${selected ? 0.35 : 0.2});
    font-size:${selected ? 26 : 22}px;cursor:pointer;
    transition:transform 160ms ease;
  `;
  // We want the emoji only — clear any prior lock badge before mutating.
  el.textContent = emoji;
  if (isPrivate) {
    const lock = document.createElement('div');
    lock.style.cssText = `
      position:absolute;top:-4px;right:-4px;
      width:18px;height:18px;border-radius:9999px;
      background:#F59E0B;border:1.5px solid #fff;
      color:#fff;font-size:10px;line-height:15px;text-align:center;
    `;
    lock.textContent = '🔒';
    el.appendChild(lock);
  }
}

function buildMarkerElement(
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
  onPress: () => void,
): HTMLDivElement {
  const el = document.createElement('div');
  styleMarkerElement(el, emoji, selected, isPrivate);
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onPress();
  });
  return el;
}

function buildPendingElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `
    position:relative;
    width:48px;height:48px;border-radius:9999px;
    background:#3757FF;color:#fff;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;
    box-shadow:0 8px 20px rgba(55,87,255,0.55);
    font-size:26px;line-height:1;
    animation: mm-pulse 1.6s ease-in-out infinite;
  `;
  el.textContent = '+';
  if (!document.getElementById('mm-pending-keyframes')) {
    const style = document.createElement('style');
    style.id = 'mm-pending-keyframes';
    style.textContent = `@keyframes mm-pulse {
      0%,100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-3px) scale(1.05); }
    }`;
    document.head.appendChild(style);
  }
  return el;
}

function installCustomLayers(
  map: maplibregl.Map,
  events: EventWithCreator[],
  route: { latitude: number; longitude: number }[] | null | undefined,
) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: eventsToGeoJson(events),
      cluster: true,
      clusterRadius: 60,
      clusterMaxZoom: 18,
    });
  } else {
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      eventsToGeoJson(events),
    );
  }
  if (!map.getLayer(CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#3757FF',
        'circle-radius': ['step', ['get', 'point_count'], 22, 10, 28, 50, 34],
        'circle-stroke-width': 3,
        'circle-stroke-color': 'rgba(255,255,255,0.9)',
      },
    });
  }
  if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 14,
        'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': '#fff' },
    });
  }

  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: routeToGeoJson(route),
    });
  } else {
    (map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      routeToGeoJson(route),
    );
  }
  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(255,255,255,0.9)', 'line-width': 8 },
    });
  }
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3757FF', 'line-width': 5 },
    });
  }
}

export const Map = forwardRef<MapRef, MapProps>(function Map(
  {
    events,
    initialCenter,
    userLocation,
    selectedEventId,
    pendingCoords,
    pickMode,
    mapStyle = 'streets',
    route,
    onMarkerPress,
    onClusterTap,
    onPickLocation,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, maplibregl.Marker>>(
    new globalThis.Map(),
  );
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMarkerPressRef = useRef(onMarkerPress);
  onMarkerPressRef.current = onMarkerPress;
  const onClusterTapRef = useRef(onClusterTap);
  onClusterTapRef.current = onClusterTap;
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;
  const pickModeRef = useRef(!!pickMode);
  pickModeRef.current = !!pickMode;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const routeRef = useRef(route);
  routeRef.current = route;

  useImperativeHandle(
    ref,
    () => ({
      animateTo: (coords, zoom) => {
        mapRef.current?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: zoom ?? 14,
          duration: 500,
        });
      },
      fitToPoints: (points, padding = 60) => {
        if (points.length === 0 || !mapRef.current) return;
        const bounds = points.reduce(
          (b, p) => b.extend([p.longitude, p.latitude]),
          new maplibregl.LngLatBounds(
            [points[0]!.longitude, points[0]!.latitude],
            [points[0]!.longitude, points[0]!.latitude],
          ),
        );
        mapRef.current.fitBounds(bounds, { padding, duration: 500 });
      },
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const styleUrl = process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl || STYLE_FOR[mapStyle] || STREETS_STYLE,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      installCustomLayers(map, eventsRef.current, routeRef.current);

      map.on('click', CLUSTER_LAYER_ID, async (e) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: [CLUSTER_LAYER_ID],
        })[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id as number | undefined;
        const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        if (clusterId == null) return;

        // Prefer opening the picker; the caller can decide whether to
        // dismiss it and zoom in instead. Falls back to expansion-zoom
        // only when no handler is wired.
        const leaves = await src.getClusterLeaves(clusterId, Infinity, 0);
        const ids = leaves
          .map((leaf) => leaf.properties?.eventId as string | undefined)
          .filter((id): id is string => !!id);
        const clusterEvents = ids
          .map((id) => eventsRef.current.find((ev) => ev.id === id))
          .filter((ev): ev is EventWithCreator => !!ev);

        if (onClusterTapRef.current && clusterEvents.length > 0) {
          onClusterTapRef.current(clusterEvents);
        } else {
          const zoom = await src.getClusterExpansionZoom(clusterId);
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng!, lat!], zoom });
        }
      });
      map.on('mouseenter', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    map.on('styledata', () => {
      if (map.isStyleLoaded()) {
        installCustomLayers(map, eventsRef.current, routeRef.current);
      }
    });

    // Long-press + pickMode click handling -------------------------------
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressStart: { x: number; y: number; lng: number; lat: number } | null = null;

    const beginPress = (
      point: { x: number; y: number },
      lngLat: { lat: number; lng: number },
    ) => {
      pressStart = { x: point.x, y: point.y, lng: lngLat.lng, lat: lngLat.lat };
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!pressStart) return;
        onPickLocationRef.current?.({
          latitude: pressStart.lat,
          longitude: pressStart.lng,
        });
        pressStart = null;
      }, LONG_PRESS_MS);
    };
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pressStart = null;
    };
    const trackDrift = (point: { x: number; y: number }) => {
      if (!pressStart) return;
      const dx = point.x - pressStart.x;
      const dy = point.y - pressStart.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_TOLERANCE_PX) cancelPress();
    };

    map.on('mousedown', (e) => beginPress(e.point, e.lngLat));
    map.on('mousemove', (e) => trackDrift(e.point));
    map.on('mouseup', cancelPress);
    map.on('touchstart', (e) => beginPress(e.point, e.lngLat));
    map.on('touchmove', (e) => trackDrift(e.point));
    map.on('touchend', cancelPress);
    map.on('dragstart', cancelPress);

    map.on('click', (e) => {
      if (!pickModeRef.current) return;
      onPickLocationRef.current?.({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      });
    });
    map.on('contextmenu', (e) => {
      onPickLocationRef.current?.({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      });
    });

    mapRef.current = map;
    return () => {
      cancelPress();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const styleUrl = process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL;
    if (styleUrl) return;
    map.setStyle(STYLE_FOR[mapStyle]);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Marker set sync — the important part. Markers persist across pan/zoom;
  // they're only added when a new event arrives, removed when an event
  // goes away, and mutated in place when their content changes. The old
  // "rebuild on every moveend" was what made them appear to drift.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyEvents = () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(eventsToGeoJson(events));

      const seen = new Set<string>();
      for (const event of events) {
        seen.add(event.id);
        const isSelected = event.id === selectedEventId;
        const existing = markersRef.current.get(event.id);
        if (existing) {
          // Keep the same DOM node so MapLibre's transform bindings stay
          // valid; just refresh visuals + position.
          styleMarkerElement(
            existing.getElement() as HTMLDivElement,
            event.emoji,
            isSelected,
            event.visibility === 'private',
          );
          existing.setLngLat([event.longitude, event.latitude]);
          continue;
        }
        const el = buildMarkerElement(
          event.emoji,
          isSelected,
          event.visibility === 'private',
          () => onMarkerPressRef.current?.(event.id),
        );
        // Center-anchored — the emoji dot IS the coord, not the tip of a pin.
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([event.longitude, event.latitude])
          .addTo(map);
        markersRef.current.set(event.id, marker);
      }
      for (const [id, marker] of markersRef.current) {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }
    };

    if (!map.isStyleLoaded()) {
      map.once('load', applyEvents);
    } else {
      applyEvents();
    }
  }, [events, selectedEventId]);

  // Visibility sync — hides markers whose event is currently rolled up
  // into a cluster. Runs on every moveend but is cheap: just toggles
  // `display` on already-mounted elements. No teardown, no flicker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncVisibility = async () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const clusterFeatures = map.queryRenderedFeatures({
        layers: [CLUSTER_LAYER_ID],
      });
      const clustered = new Set<string>();
      await Promise.all(
        clusterFeatures.map(async (feature) => {
          const cid = feature.properties?.cluster_id as number | undefined;
          if (cid == null) return;
          const leaves = await src.getClusterLeaves(cid, Infinity, 0);
          for (const leaf of leaves) {
            const id = leaf.properties?.eventId as string | undefined;
            if (id) clustered.add(id);
          }
        }),
      );
      for (const [id, marker] of markersRef.current) {
        marker.getElement().style.display = clustered.has(id) ? 'none' : 'flex';
      }
    };

    const armed = () => {
      if (map.isStyleLoaded()) void syncVisibility();
      else map.once('load', syncVisibility);
    };
    armed();
    map.on('moveend', syncVisibility);
    map.on('sourcedata', syncVisibility);
    return () => {
      map.off('moveend', syncVisibility);
      map.off('sourcedata', syncVisibility);
    };
  }, [events]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) src.setData(routeToGeoJson(route));
    };
    if (!map.isStyleLoaded()) {
      map.once('load', apply);
    } else {
      apply();
    }
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pendingCoords) {
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
      return;
    }
    if (!pendingMarkerRef.current) {
      pendingMarkerRef.current = new maplibregl.Marker({
        element: buildPendingElement(),
        anchor: 'center',
      })
        .setLngLat([pendingCoords.longitude, pendingCoords.latitude])
        .addTo(map);
    } else {
      pendingMarkerRef.current.setLngLat([
        pendingCoords.longitude,
        pendingCoords.latitude,
      ]);
    }
  }, [pendingCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `
        width:16px;height:16px;border-radius:9999px;
        background:#3757FF;border:3px solid white;
        box-shadow:0 0 0 6px rgba(55,87,255,0.25);
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
    }
  }, [userLocation]);

  useEffect(() => {
    if (!selectedEventId) return;
    const target = events.find((e) => e.id === selectedEventId);
    if (!target || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [target.longitude, target.latitude],
      zoom: 14,
      duration: 500,
    });
  }, [selectedEventId, events]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
});
