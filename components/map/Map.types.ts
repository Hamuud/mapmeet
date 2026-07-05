import type { EventWithCreator, LatLng } from '@/types';

export type MapStyle = 'streets' | 'satellite' | 'terrain';

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
};

export type MapRef = {
  animateTo: (coords: LatLng, zoom?: number) => void;
  /** Nudge the camera one zoom step in / out. Used by the custom zoom
   *  stack in the desktop layout — mobile uses pinch. */
  zoomIn: () => void;
  zoomOut: () => void;
};
