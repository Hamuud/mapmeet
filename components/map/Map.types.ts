import type { EventWithCreator, LatLng } from '@/types';

export type MapProps = {
  events: EventWithCreator[];
  initialCenter: LatLng;
  userLocation?: LatLng | null;
  selectedEventId?: string | null;
  /** Semi-transparent pin drawn wherever the user is composing an event.
   *  Distinct from published event markers so the difference reads at a
   *  glance. */
  pendingCoords?: LatLng | null;
  /** When on, any tap on the map picks a location. When off, only a
   *  long-press does. Toggled from the "Change position" flow. */
  pickMode?: boolean;
  onMarkerPress?: (eventId: string) => void;
  /** Long-press on the map (mobile) OR any tap while pickMode is on. */
  onPickLocation?: (coords: LatLng) => void;
};

export type MapRef = {
  animateTo: (coords: LatLng, zoom?: number) => void;
};
