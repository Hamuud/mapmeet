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
  /** Optional polyline drawn on top of everything else — used for
   *  directions to a joined event. */
  route?: LatLng[] | null;
  onMarkerPress?: (eventId: string) => void;
  onPickLocation?: (coords: LatLng) => void;
};

export type MapRef = {
  animateTo: (coords: LatLng, zoom?: number) => void;
  /** Fit the camera to a bounding box built from a polyline. Used to
   *  frame the whole route after directions arrive. */
  fitToPoints: (points: LatLng[], padding?: number) => void;
};
