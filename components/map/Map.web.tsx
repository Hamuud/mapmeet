import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { MapProps, MapRef } from './Map.types';
import type { EventWithCreator } from '@/types';

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
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

const SOURCE_ID = 'mapmeet-events';
const CLUSTER_LAYER_ID = 'mapmeet-clusters';
const CLUSTER_COUNT_LAYER_ID = 'mapmeet-cluster-count';
/** Long-press threshold — matches Android's default. */
const LONG_PRESS_MS = 500;
/** How far the finger/cursor can drift and still count as a long-press. */
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

function buildMarkerElement(
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
  onPress: () => void,
): HTMLDivElement {
  const el = document.createElement('div');
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
  // Register the keyframes once — repeated appends are harmless.
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

export const Map = forwardRef<MapRef, MapProps>(function Map(
  {
    events,
    initialCenter,
    userLocation,
    selectedEventId,
    pendingCoords,
    pickMode,
    onMarkerPress,
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
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;
  const pickModeRef = useRef(!!pickMode);
  pickModeRef.current = !!pickMode;

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
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const styleUrl = process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl || OSM_RASTER_STYLE,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 18,
      });
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

      map.on('click', CLUSTER_LAYER_ID, (e) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: [CLUSTER_LAYER_ID],
        })[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id as number | undefined;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        if (clusterId == null) return;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng!, lat!], zoom });
        });
      });
      map.on('mouseenter', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    // Long-press + pickMode click handling ------------------------------
    // MapLibre only exposes `mousedown`/`mouseup`/`touchstart`/`touchend`,
    // not a synthetic long-press event, so we time it ourselves. If the
    // pointer drifts more than LONG_PRESS_TOLERANCE_PX we abort — that's
    // a drag, not a press.
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

    // Regular click: only picks when we're in explicit pickMode.
    map.on('click', (e) => {
      if (!pickModeRef.current) return;
      onPickLocationRef.current?.({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      });
    });
    // Right-click also picks — desktop shortcut equivalent to long-press.
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

  // Swap the map canvas cursor when pickMode toggles so the affordance is obvious.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Reconcile point markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyMarkers = () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(eventsToGeoJson(events));

      const clusteredIds = new Set<string>();
      const clusterFeatures = map.queryRenderedFeatures({ layers: [CLUSTER_LAYER_ID] });
      const promises = clusterFeatures.map(async (feature) => {
        const cid = feature.properties?.cluster_id as number | undefined;
        if (cid == null) return;
        const leaves = await src.getClusterLeaves(cid, Infinity, 0);
        for (const leaf of leaves) {
          const id = leaf.properties?.eventId as string | undefined;
          if (id) clusteredIds.add(id);
        }
      });
      Promise.all(promises).then(() => {
        for (const [, marker] of markersRef.current) marker.remove();
        markersRef.current.clear();

        for (const event of events) {
          const isSelected = event.id === selectedEventId;
          const isHidden = clusteredIds.has(event.id);
          const el = buildMarkerElement(
            event.emoji,
            isSelected,
            event.visibility === 'private',
            () => onMarkerPressRef.current?.(event.id),
          );
          if (isHidden) el.style.display = 'none';
          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([event.longitude, event.latitude])
            .addTo(map);
          markersRef.current.set(event.id, marker);
        }
      });
    };

    if (!map.isStyleLoaded()) {
      map.once('load', applyMarkers);
    } else {
      applyMarkers();
    }

    map.on('moveend', applyMarkers);
    return () => {
      map.off('moveend', applyMarkers);
    };
  }, [events, selectedEventId]);

  // Pending marker (the "you're placing an event here" pin).
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
        anchor: 'bottom',
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
