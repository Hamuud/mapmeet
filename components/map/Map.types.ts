import type { EventWithCreator, LatLng } from '@/types';

export type MapStyle = 'streets' | 'satellite' | 'terrain';

/** The visible region, in plain lat/lng bounds. Emitted after the camera
 *  settles so the screen can load imported events for what's on screen
 *  instead of the whole country. */
export type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type MapProps = {
  events: EventWithCreator[];
  initialCenter: LatLng;
  userLocation?: LatLng | null;
  selectedEventId?: string | null;
  pendingCoords?: LatLng | null;
  pickMode?: boolean;
  mapStyle?: MapStyle;
  onMarkerPress?: (eventId: string) => void;
  onClusterTap?: (events: EventWithCreator[]) => void;
  onPickLocation?: (coords: LatLng) => void;
  /** Fires once the camera settles (and on first render). */
  onRegionChange?: (bounds: MapBounds) => void;
};

export type MapRef = {
  animateTo: (coords: LatLng, zoom?: number) => void;
  /** Nudge the camera one zoom step in / out. Used by the custom zoom
   *  stack in the desktop layout — mobile uses pinch. */
  zoomIn: () => void;
  zoomOut: () => void;
};
