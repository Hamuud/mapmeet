import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { clusterEmojis } from './clusterEmojis';
import type { MapProps, MapRef, MapStyle } from './Map.types';
import { particleLayout } from '@/features/events/pinParticles';
import {
  resolvePinStyle,
  type ResolvedPinStyle,
} from '@/features/events/pinStyle';
import type { PinEffect } from '@/types/database';
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
  accent: '#FE5800',
  mutedText: '#8B8880',
};

/** Keyframes for the premium pin effects. Injected once — the DOM
 *  markers are built by hand, so there is no stylesheet to put them in.
 *  Mirrors the RN Animated versions in MapMarker.tsx; keep the two in
 *  step or a premium pin looks like a different feature per platform. */
function ensurePinKeyframes() {
  if (document.getElementById('mm-pin-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'mm-pin-keyframes';
  style.textContent = `
    @keyframes mm-pin-glow {
      0%   { transform: scale(1);   opacity: 0.45; }
      100% { transform: scale(1.7); opacity: 0; }
    }
    @keyframes mm-pin-fall {
      0%   { transform: translate(0, -10px); opacity: 0; }
      15%  { opacity: 1; }
      80%  { opacity: 1; }
      100% { transform: translate(var(--mm-drift, 0px), 48px); opacity: 0; }
    }
    @keyframes mm-pin-shine {
      0%   { transform: translateX(-48px) rotate(22deg); }
      45%  { transform: translateX(48px)  rotate(22deg); }
      100% { transform: translateX(48px)  rotate(22deg); }
    }
  `;
  document.head.appendChild(style);
}

const TAG_SIZE = 44;
const TAG_SIZE_SELECTED = 48;

/** The pieces of one marker, kept so the reconcile can patch them.
 *
 *  This bookkeeping is the whole point. The old code rebuilt every child
 *  on each pass (`el.textContent = ''`), and since the reconcile runs on
 *  any change to the events array *and* on every selection change, the
 *  CSS animations restarted several times a second — the effects looked
 *  broken rather than cyclical. Now the nodes carrying an `animation`
 *  are created once and only touched when the effect itself changes;
 *  colour, emoji, selection and data refreshes patch around them. */
type MarkerParts = {
  wrap: HTMLDivElement;
  body: HTMLDivElement;
  glyph: HTMLSpanElement;
  dot: HTMLDivElement;
  lock: HTMLDivElement | null;
  ring: HTMLDivElement | null;
  bar: HTMLDivElement | null;
  stars: HTMLDivElement[];
  /** Which effect the layers above were built for. */
  effect: PinEffect | null;
  /** Stable per-event scatter for the falling particles. */
  seed: string;
};

const MARKER_PARTS = new WeakMap<HTMLElement, MarkerParts>();

/** Tear down whatever effect layers exist and build the ones the new
 *  effect needs. Called only on an actual effect change, so a running
 *  animation is never interrupted by anything else. */
function rebuildEffectLayers(parts: MarkerParts, style: ResolvedPinStyle) {
  parts.ring?.remove();
  parts.bar?.remove();
  parts.stars.forEach((s) => s.remove());
  parts.ring = null;
  parts.bar = null;
  parts.stars = [];

  if (style.effect === 'glow') {
    const ring = document.createElement('div');
    ring.style.cssText = `
      position:absolute;width:${TAG_SIZE}px;height:${TAG_SIZE}px;
      border-radius:20px;background:${style.color ?? 'transparent'};
      pointer-events:none;
      animation: mm-pin-glow 1.8s ease-out infinite;
    `;
    // Behind the tag.
    parts.wrap.insertBefore(ring, parts.body);
    parts.ring = ring;
  }

  if (style.effect === 'shine') {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;top:${-TAG_SIZE}px;left:0;
      width:${Math.round(TAG_SIZE * 0.42)}px;height:${TAG_SIZE * 3}px;
      background:rgba(255,255,255,0.55);
      pointer-events:none;
      animation: mm-pin-shine 2.5s ease-in-out infinite;
    `;
    parts.body.appendChild(bar);
    parts.bar = bar;
  }

  if (style.effect === 'stars') {
    for (const p of particleLayout(parts.seed)) {
      const star = document.createElement('div');
      // `both` matters: without a backwards fill the particle sits
      // visible at the top of the pin until its delay elapses, which on
      // a 1.8s stagger is very obvious.
      star.style.cssText = `
        position:absolute;top:0;left:${p.left.toFixed(1)}px;
        font-size:10px;line-height:1;pointer-events:none;
        --mm-drift:${p.drift}px;
        animation: mm-pin-fall ${p.duration.toFixed(2)}s linear ${p.delay.toFixed(2)}s infinite both;
      `;
      // In front of the tag.
      parts.wrap.appendChild(star);
      parts.stars.push(star);
    }
  }
  parts.effect = style.effect;
}

/** Patch a marker to match the current event state.
 *
 *  Everything here is a property assignment on a node that already
 *  exists. Selecting a pin or recolouring it re-runs this and the
 *  animations keep their phase. */
function updateMarkerElement(
  el: HTMLDivElement,
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
  style: ResolvedPinStyle,
) {
  const parts = MARKER_PARTS.get(el);
  if (!parts) return;

  const size = selected ? TAG_SIZE_SELECTED : TAG_SIZE;
  // Selection outranks the premium colour — the user has to be able to
  // tell which pin they just tapped, whoever owns it. Note this is the
  // ONLY thing selection changes: the effect keeps running underneath.
  const styled = !!style.color && !selected;
  const fill = selected ? DS.ink : styled ? style.color! : DS.panel;
  const stroke = selected ? DS.ink : styled ? style.color! : DS.border;

  // Safe to replace wholesale: the body itself carries no animation, and
  // cssText does not touch its children (the shine bar and the lock).
  parts.body.style.cssText = `
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    border-radius:18px;
    border-bottom-left-radius:4px;
    transform:rotate(${selected ? '0deg' : '-4deg'});
    background:${fill};
    border:1px solid ${stroke};
    box-shadow:0 ${selected ? 12 : 8}px ${selected ? 20 : 16}px rgba(0,0,0,${selected ? 0.4 : 0.2});
    font-size:${selected ? 24 : 22}px;line-height:1;
    cursor:pointer;
    ${style.effect === 'shine' ? 'overflow:hidden;' : ''}
    transition:transform 160ms ease, background 160ms ease;
  `;
  parts.glyph.textContent = emoji;

  if (isPrivate && !parts.lock) {
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
    parts.body.appendChild(lock);
    parts.lock = lock;
  } else if (!isPrivate && parts.lock) {
    parts.lock.remove();
    parts.lock = null;
  }

  if (parts.effect !== style.effect) rebuildEffectLayers(parts, style);

  // Colour and glyph changes are patched onto the existing nodes, so
  // recolouring a pin does not restart its glow or its particles.
  if (parts.ring) parts.ring.style.background = style.color ?? 'transparent';
  parts.stars.forEach((star, i) => {
    const next = style.glyphs[i % style.glyphs.length] ?? '✦';
    if (star.textContent !== next) star.textContent = next;
  });

  parts.dot.style.background = selected
    ? DS.ink
    : styled
      ? style.color!
      : 'rgba(14,14,16,0.8)';
}

function buildMarkerElement(
  seed: string,
  emoji: string,
  selected: boolean,
  isPrivate: boolean,
  style: ResolvedPinStyle,
  onPress: () => void,
): HTMLDivElement {
  ensurePinKeyframes();

  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:4px;';

  // The tag sits in its own stacking context so the glow can go behind
  // it and the particles in front without either affecting the column.
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:relative;display:flex;align-items:center;justify-content:center;';

  const body = document.createElement('div');
  // The emoji lives in its own span rather than as the body's text, so
  // updating it can never clobber the effect layers parented to the body.
  const glyph = document.createElement('span');
  body.appendChild(glyph);
  wrap.appendChild(body);
  el.appendChild(wrap);

  const dot = document.createElement('div');
  dot.style.cssText = 'width:6px;height:6px;border-radius:9999px;';
  el.appendChild(dot);

  MARKER_PARTS.set(el, {
    wrap,
    body,
    glyph,
    dot,
    lock: null,
    ring: null,
    bar: null,
    stars: [],
    effect: null,
    seed,
  });

  updateMarkerElement(el, emoji, selected, isPrivate, style);

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
      // Match the native useCluster tuning: radius 80 + a 2-point
      // minimum so even a pair of nearby events merges into the
      // rotating-emoji circle rather than stacking as two pins.
      clusterRadius: 80,
      clusterMinPoints: 2,
      clusterMaxZoom: 18,
    });
  } else {
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      eventsToGeoJson(events),
    );
  }
}

/** Brand indigo — the cluster circle's fill (deliberately not ink:
 *  "the circle shouldn't be black"). */
const CLUSTER_BG = '#4B5FE0';
// "Barely noticeable" — 40 s per revolution. Kept in lockstep with the
// native ORBIT_MS.
const ORBIT_SECONDS = 40;

/** (Re)build a cluster's DOM: a colored circle with the events' emojis
 *  slowly orbiting inside it, plus a count badge when the cluster holds
 *  more events than emojis shown. The ring rotates as a whole; each
 *  emoji counter-rotates at the same rate so the glyphs stay upright
 *  while travelling the circle. */
function styleClusterElement(
  el: HTMLDivElement,
  emojis: string[],
  count: number,
) {
  if (!document.getElementById('mm-cluster-keyframes')) {
    const style = document.createElement('style');
    style.id = 'mm-cluster-keyframes';
    style.textContent = `
      @keyframes mm-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes mm-orbit-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
    `;
    document.head.appendChild(style);
  }

  el.textContent = '';
  el.style.cssText = `position:relative;cursor:pointer;`;

  const n = emojis.length;
  // Kept in lockstep with the native ClusterBubble sizes so the two
  // platforms feel identical.
  const size = n === 1 ? 52 : n === 2 ? 60 : n === 3 ? 68 : n === 4 ? 74 : 80;
  const radius = n === 1 ? 0 : size / 2 - 16;

  const circle = document.createElement('div');
  circle.style.cssText = `
    position:relative;width:${size}px;height:${size}px;border-radius:9999px;
    background:${CLUSTER_BG};
    border:2px solid rgba(253,252,248,0.95);
    box-shadow:0 8px 16px rgba(0,0,0,0.28);
  `;

  const ring = document.createElement('div');
  ring.style.cssText = `position:absolute;inset:0;animation:mm-orbit ${ORBIT_SECONDS}s linear infinite;`;
  emojis.forEach((emoji, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = size / 2 - 2 + radius * Math.cos(angle); // -2: border offset
    const y = size / 2 - 2 + radius * Math.sin(angle);
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute;left:${Math.round(x - 11)}px;top:${Math.round(y - 11)}px;
      width:22px;height:22px;display:flex;align-items:center;justify-content:center;
      font-size:14px;line-height:1;
      animation:mm-orbit-rev ${ORBIT_SECONDS}s linear infinite;
    `;
    wrap.textContent = emoji;
    ring.appendChild(wrap);
  });
  circle.appendChild(ring);
  el.appendChild(circle);

  if (count > emojis.length) {
    const badge = document.createElement('div');
    badge.style.cssText = `
      position:absolute;top:-5px;right:-5px;
      height:20px;min-width:20px;padding:0 4px;border-radius:9999px;
      background:${DS.ink};color:${DS.paper};
      border:1px solid rgba(253,252,248,0.9);
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
    const container = containerRef.current;
    const styleUrl = process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL;
    const map = new maplibregl.Map({
      container,
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

    // MapLibre sizes its WebGL canvas to the container at construction and
    // only auto-corrects on *window* resize (trackResize). When the map
    // mounts during a client-side navigation — e.g. right after login,
    // which does router.replace('/(tabs)/map') rather than a full reload —
    // the container may still be laying out, so the canvas can come up at
    // the wrong size and paint black until something resizes it (which a
    // page refresh happens to do for free). A ResizeObserver nudges the
    // map the instant the container reaches its real size, so it paints
    // straight away without needing a refresh.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    // Belt-and-suspenders: also correct on the next frame in case the
    // observer's first callback races the initial paint.
    const raf = requestAnimationFrame(() => map.resize());

    return () => {
      cancelPress();
      ro.disconnect();
      cancelAnimationFrame(raf);
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
        const pinStyle = resolvePinStyle(event, event.creator?.role);
        if (existing) {
          // Keep the same DOM node so MapLibre's transform bindings stay
          // valid; just refresh visuals + position.
          updateMarkerElement(
            existing.getElement() as HTMLDivElement,
            event.emoji,
            isSelected,
            event.visibility === 'private',
            pinStyle,
          );
          existing.setLngLat([event.longitude, event.latitude]);
          continue;
        }
        const el = buildMarkerElement(
          event.id,
          event.emoji,
          isSelected,
          event.visibility === 'private',
          pinStyle,
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
