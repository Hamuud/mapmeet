// Re-export so screens can `import { Map } from '@/components/map'` and
// Metro picks the right platform implementation (Map.native.tsx or Map.web.tsx).
export { Map } from './Map';
export { MapMarker } from './MapMarker';
export { MapStyleSwitcher } from './MapStyleSwitcher';
export type { MapProps, MapRef, MapStyle } from './Map.types';
