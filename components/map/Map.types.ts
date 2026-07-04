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
  route?: LatLng[] | null;
  onMarkerPress?: (eventId: string) => void;
  /** Fires when a cluster is tapped, with every event contained within it.
   *  Callers can either open a picker or zoom in. */
  onClusterTap?: (events: EventWithCreator[]) => void;
  onPickLocation?: (coords: LatLng) => void;
};

export type MapRef = {
  animateTo: (coords: LatLng, zoom?: number) => void;
  fitToPoints: (points: LatLng[], padding?: number) => void;
};
