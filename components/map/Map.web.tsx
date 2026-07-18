import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { clusterEmojis } from './clusterEmojis';
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

// ── Design system tokens (mirror of tailwind.config.js) ────────────────
// The web map builds its markers as raw DOM so it can't lean on
// NativeWind classes. Keeping the token values here means changes to
// the palette / radii only need to happen in tailwind.config.js + this
// tiny block.
const DS = {
  paper: '#F6F4EE',
  panel: '#FDFCF8',
  ink: '#0E0E10',
  border: '#E4E1D8',
  accent: '#E68A5E',
  mutedText: '#8B8880',
};

/** Style the "tag" body — rounded rect with a pin-corner clip. Kept as
 *  a helper so the reconcile-in-place update path renders identically
 *  to a fresh construction. */
function styleMarkerBody(
  body: HTMLDivElement,
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
) {
  const size = selected ? 48 : 44;
  const rot = selected ? '0deg' : '-4deg';
  body.style.cssText = `
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    border-radius:18px;
    border-bottom-left-radius:4px;
    transform:rotate(${rot});
    background:${selected ? DS.ink : DS.panel};
    border:1px solid ${selected ? DS.ink : DS.border};
    box-shadow:0 ${selected ? 12 : 8}px ${selected ? 20 : 16}px rgba(0,0,0,${selected ? 0.4 : 0.2});
    font-size:${selected ? 24 : 22}px;line-height:1;
    cursor:pointer;
    transition:transform 160ms ease, background 160ms ease;
  `;
  body.textContent = emoji;
  if (isPrivate) {
    const lock = document.createElement('div');
    lock.style.cssText = `
      position:absolute;top:-4px;right:-4px;
      width:16px;height:16px;border-radius:9999px;
      background:${DS.ink};border:1px solid ${DS.panel};
      color:${DS.paper};
      display:flex;align-items:center;justify-content:center;
      font-size:8px;line-height:1;
    `;
    lock.textContent = '🔒';
    body.appendChild(lock);
  }
}

/** Rebuild the whole marker element (tag + underdot). Assumes the caller
 *  will attach the returned element to a new maplibregl.Marker — mutating
 *  the tag body in-place is fine, but appending the underdot fresh keeps
 *  the layering trivial. */
function styleMarkerElement(
  el: HTMLDivElement,
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
) {
  el.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:4px;
  `;
  el.textContent = '';

  const body = document.createElement('div');
  styleMarkerBody(body, emoji, selected, isPrivate);
  el.appendChild(body);

  const dot = document.createElement('div');
  dot.style.cssText = `
    width:6px;height:6px;border-radius:9999px;
    background:${selected ? DS.ink : 'rgba(14,14,16,0.8)'};
  `;
  el.appendChild(dot);
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
  // Composite element: tag + underdot + "New event here" pill, coral.
  // Coral is the ONE accent — reserved for this + the create-event FAB.
  const el = document.createElement('div');
  el.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:4px;
    animation: mm-pulse 1.6s ease-in-out infinite;
  `;

  const body = document.createElement('div');
  body.style.cssText = `
    width:44px;height:44px;
    display:flex;align-items:center;justify-content:center;
    border-radius:18px;
    border-bottom-left-radius:4px;
    background:${DS.accent};
    border:1px solid ${DS.accent};
    color:#fff;font-size:22px;line-height:1;
    box-shadow:0 12px 20px rgba(0,0,0,0.3);
  `;
  body.textContent = '+';
  el.appendChild(body);

  const dot = document.createElement('div');
  dot.style.cssText = `
    width:6px;height:6px;border-radius:9999px;background:${DS.accent};
  `;
  el.appendChild(dot);

  const pill = document.createElement('div');
  pill.style.cssText = `
    padding:2px 8px;border-radius:9999px;background:${DS.accent};
    color:#fff;font-size:10px;font-weight:600;line-height:1.2;
    font-family: Manrope, -apple-system, sans-serif;
  `;
  pill.textContent = 'New event here';
  el.appendChild(pill);

  if (!document.getElementById('mm-pending-keyframes')) {
    const style = document.createElement('style');
    style.id = 'mm-pending-keyframes';
    style.textContent = `@keyframes mm-pulse {
      0%,100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-3px) scale(1.03); }
    }`;
    document.head.appendChild(style);
  }
  return el;
}

/** The clustered GeoJSON source is the clustering ENGINE only — no
 *  MapLibre layers render it. Clusters draw as DOM markers (emoji
 *  chips, see styleClusterElement) synced from the source's cluster
 *  features, same as individual event markers. The old circle+count
 *  layers were anonymous black dots — and the count never rendered
 *  anyway because the raster styles ship no glyph fonts. */
function installCustomLayers(map: maplibregl.Map, events: EventWithCreator[]) {
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
}

/** (Re)build a cluster chip's DOM: up to 5 emojis (3 per row) + a count
 *  badge when the cluster holds more events than emojis shown. */
function styleClusterElement(
  el: HTMLDivElement,
  emojis: string[],
  count: number,
) {
  el.textContent = '';
  el.style.cssText = `position:relative;cursor:pointer;`;

  // Row shape: 1-3 emojis one line, 4 → 2×2, 5 → 3+2. content-box so
  // the max-width is exactly N emoji slots — border-box ate the border
  // and wrapped a 3-row into 2+1.
  const perRow = emojis.length === 4 ? 2 : 3;
  const chip = document.createElement('div');
  chip.style.cssText = `
    display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
    box-sizing:content-box;
    max-width:${perRow * 24}px;
    padding:7px 10px;border-radius:24px;
    background:${DS.panel};border:1px solid ${DS.border};
    box-shadow:0 8px 16px rgba(0,0,0,0.2);
    line-height:1;
  `;
  for (const emoji of emojis) {
    const span = document.createElement('span');
    span.style.cssText = 'font-size:16px;line-height:22px;width:24px;text-align:center;';
    span.textContent = emoji;
    chip.appendChild(span);
  }
  el.appendChild(chip);

  if (count > emojis.length) {
    const badge = document.createElement('div');
    badge.style.cssText = `
      position:absolute;top:-6px;right:-6px;
      height:20px;min-width:20px;padding:0 4px;border-radius:9999px;
      background:${DS.ink};color:${DS.paper};
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:700;
      font-family: Manrope, -apple-system, sans-serif;
    `;
    badge.textContent = String(count);
    el.appendChild(badge);
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
    onMarkerPress,
    onClusterTap,
    onPickLocation,
    onRegionChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, maplibregl.Marker>>(
    new globalThis.Map(),
  );
  /** Emoji-chip markers for clusters, keyed by MapLibre cluster_id.
   *  `key` fingerprints the rendered content (emojis + count) so a sync
   *  pass can skip restyling untouched chips. */
  const clusterMarkersRef = useRef<
    globalThis.Map<number, { marker: maplibregl.Marker; key: string }>
  >(new globalThis.Map());
  /** Monotonic token: getClusterLeaves is async, so a pan can start a
   *  newer sync pass while an older one is mid-await — the older pass
   *  must not mutate the DOM with stale geometry. */
  const clusterSyncTokenRef = useRef(0);
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
  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;

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
      zoomIn: () => mapRef.current?.zoomIn({ duration: 250 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 250 }),
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
    // The built-in NavigationControl was drawing its own +/− buttons on
    // top-right — duplicating our custom MapZoomStack. Ours is fed by
    // MapRef.zoomIn/zoomOut, so no library control is needed.

    map.on('load', () => {
      installCustomLayers(map, eventsRef.current);
    });

    map.on('styledata', () => {
      if (map.isStyleLoaded()) {
        installCustomLayers(map, eventsRef.current);
      }
    });

    // Viewport → imported-event fetch. `moveend` covers pan, zoom and
    // flyTo alike; `load` seeds the first region so events show without
    // the user having to touch the map.
    const emitBounds = () => {
      const b = map.getBounds();
      onRegionChangeRef.current?.({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      });
    };
    map.on('load', emitBounds);
    map.on('moveend', emitBounds);

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
      clusterMarkersRef.current.clear();
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

  // Cluster sync — replaces the old circle/count layers. Enumerates the
  // source's cluster features (dedup by cluster_id: tiles overlap),
  // renders each as an emoji-chip DOM marker, hides the individual
  // markers it swallows, and prunes chips whose cluster dissolved.
  // Runs on every moveend/sourcedata; markers mutate in place so
  // there's no flicker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncClusters = async () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const token = ++clusterSyncTokenRef.current;

      const clusterFeats = new globalThis.Map<
        number,
        maplibregl.MapGeoJSONFeature
      >();
      for (const f of map.querySourceFeatures(SOURCE_ID)) {
        const cid = f.properties?.cluster_id as number | undefined;
        if (typeof cid === 'number' && !clusterFeats.has(cid)) {
          clusterFeats.set(cid, f);
        }
      }

      const clusteredIds = new Set<string>();
      const alive = new Set<number>();
      for (const [cid, feature] of clusterFeats) {
        let leaves;
        try {
          leaves = await src.getClusterLeaves(cid, Infinity, 0);
        } catch {
          continue; // cluster dissolved mid-flight (zoom changed)
        }
        // A newer pass superseded this one — bail before mutating DOM
        // with stale cluster geometry.
        if (token !== clusterSyncTokenRef.current) return;

        const members = leaves
          .map((leaf) => leaf.properties?.eventId as string | undefined)
          .map((id) => (id ? eventsRef.current.find((ev) => ev.id === id) : undefined))
          .filter((ev): ev is EventWithCreator => !!ev);
        if (members.length === 0) continue;

        for (const m of members) clusteredIds.add(m.id);
        alive.add(cid);

        const emojis = clusterEmojis(members);
        const key = `${emojis.join('')}|${members.length}`;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;

        const existing = clusterMarkersRef.current.get(cid);
        if (existing) {
          existing.marker.setLngLat([lng!, lat!]);
          if (existing.key !== key) {
            styleClusterElement(
              existing.marker.getElement() as HTMLDivElement,
              emojis,
              members.length,
            );
            existing.key = key;
          }
          continue;
        }

        const el = document.createElement('div');
        styleClusterElement(el, emojis, members.length);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // Resolve membership at CLICK time — the closure's snapshot
          // would go stale as events churn under a live cluster.
          void src.getClusterLeaves(cid, Infinity, 0).then((fresh) => {
            const evs = fresh
              .map((leaf) => leaf.properties?.eventId as string | undefined)
              .map((id) =>
                id ? eventsRef.current.find((e2) => e2.id === id) : undefined,
              )
              .filter((e2): e2 is EventWithCreator => !!e2);
            if (evs.length > 0) onClusterTapRef.current?.(evs);
          });
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng!, lat!])
          .addTo(map);
        clusterMarkersRef.current.set(cid, { marker, key });
      }

      for (const [cid, entry] of clusterMarkersRef.current) {
        if (!alive.has(cid)) {
          entry.marker.remove();
          clusterMarkersRef.current.delete(cid);
        }
      }
      for (const [id, marker] of markersRef.current) {
        marker.getElement().style.display = clusteredIds.has(id) ? 'none' : 'flex';
      }
    };

    const handler = () => void syncClusters();
    if (map.isStyleLoaded()) void syncClusters();
    else map.once('load', handler);
    map.on('moveend', handler);
    map.on('sourcedata', handler);
    return () => {
      map.off('moveend', handler);
      map.off('sourcedata', handler);
    };
  }, [events]);

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
      // Refined indigo — new brand-500 token.
      el.style.cssText = `
        width:14px;height:14px;border-radius:9999px;
        background:#4B5FE0;border:3px solid #FDFCF8;
        box-shadow:0 0 0 6px rgba(75,95,224,0.22);
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
