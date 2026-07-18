import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type LongPressEvent,
  type MapPressEvent,
  type MapType,
  type Region,
} from 'react-native-maps';

import { clusterEmojis } from './clusterEmojis';
import { MapMarker, PendingMarker } from './MapMarker';
import { useCluster } from './useCluster';
import type { MapProps, MapRef, MapStyle } from './Map.types';
import type { EventWithCreator } from '@/types';

const DEFAULT_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

function deltaFromZoom(zoom: number) {
  const longitudeDelta = 360 / Math.pow(2, zoom);
  return { latitudeDelta: longitudeDelta, longitudeDelta };
}

function toMapType(style: MapStyle | undefined): MapType {
  if (style === 'satellite') return 'satellite';
  if (style === 'terrain') return Platform.OS === 'android' ? 'hybrid' : 'terrain';
  return 'standard';
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
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>({
    ...initialCenter,
    ...DEFAULT_DELTA,
  });

  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;

  /** Region → plain bounds for the viewport fetch. The deltas are the
   *  full span, so half of each reaches from the centre to an edge. */
  const handleRegionChangeComplete = useCallback((next: Region) => {
    setRegion(next);
    onRegionChangeRef.current?.({
      minLat: next.latitude - next.latitudeDelta / 2,
      maxLat: next.latitude + next.latitudeDelta / 2,
      minLng: next.longitude - next.longitudeDelta / 2,
      maxLng: next.longitude + next.longitudeDelta / 2,
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      animateTo: (coords, zoom) => {
        const delta = zoom ? deltaFromZoom(zoom) : DEFAULT_DELTA;
        mapRef.current?.animateToRegion(
          { latitude: coords.latitude, longitude: coords.longitude, ...delta },
          400,
        );
      },
      // Native uses pinch — desktop-only stack doesn't call these on iOS.
      // Kept in the shape for MapRef type coherence.
      zoomIn: () => {
        mapRef.current?.getCamera().then((cam: { zoom?: number }) => {
          if (cam.zoom != null) mapRef.current?.animateCamera({ zoom: cam.zoom + 1 });
        });
      },
      zoomOut: () => {
        mapRef.current?.getCamera().then((cam: { zoom?: number }) => {
          if (cam.zoom != null) mapRef.current?.animateCamera({ zoom: cam.zoom - 1 });
        });
      },
    }),
    [],
  );

  const initialRegion: Region = useMemo(
    () => ({ ...initialCenter, ...DEFAULT_DELTA }),
    [initialCenter],
  );

  const clusters = useCluster(events, region);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      mapType={toMapType(mapStyle)}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      onRegionChangeComplete={handleRegionChangeComplete}
      onLongPress={(e: LongPressEvent) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onPickLocation?.({ latitude, longitude });
      }}
      onPress={(e: MapPressEvent) => {
        if (!pickMode) return;
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onPickLocation?.({ latitude, longitude });
      }}
    >
      {userLocation ? (
        <Marker
          coordinate={userLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        />
      ) : null}

      {pendingCoords ? (
        <Marker
          coordinate={pendingCoords}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={999}
        >
          <PendingMarker />
        </Marker>
      ) : null}

      {clusters.map((c) =>
        c.kind === 'cluster' ? (
          <Marker
            key={c.id}
            coordinate={c.coordinate}
            // Center anchor — the bubble is a round chip, not a pin.
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onClusterTap?.(c.leaves())}
            tracksViewChanges={false}
          >
            <ClusterBubble events={c.leaves()} count={c.count} />
          </Marker>
        ) : (
          <Marker
            key={c.id}
            coordinate={c.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onMarkerPress?.(c.event.id)}
            tracksViewChanges={false}
          >
            <MapMarker
              emoji={c.event.emoji}
              title={c.event.title}
              selected={selectedEventId === c.event.id}
              isPrivate={c.event.visibility === 'private'}
            />
          </Marker>
        ),
      )}
    </MapView>
  );
});

/** Cluster chip: the emojis of the events inside it, not an anonymous
 *  circle. ≤5 events → one emoji each (🎫🎫 reads as "two events");
 *  more → up to 5 distinct emojis + a count badge for the total. */
function ClusterBubble({
  events,
  count,
}: {
  events: EventWithCreator[];
  count: number;
}) {
  const emojis = clusterEmojis(events);
  const showBadge = count > emojis.length;
  return (
    <View>
      <View
        className="flex-row flex-wrap items-center justify-center rounded-3xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
        style={{
          // Row shape: 1-3 emojis one line, 4 → 2×2, 5 → 3+2. RN sizes
          // border-box, so the cap = slots + padding (20) + border (2).
          maxWidth: (emojis.length === 4 ? 2 : 3) * 24 + 22,
          paddingHorizontal: 10,
          paddingVertical: 7,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        {emojis.map((emoji, i) => (
          <Text key={`${emoji}-${i}`} style={{ fontSize: 16, lineHeight: 22, width: 24, textAlign: 'center' }}>
            {emoji}
          </Text>
        ))}
      </View>
      {showBadge ? (
        <View
          className="absolute -right-1.5 -top-1.5 items-center justify-center rounded-full bg-text-light dark:bg-text-dark"
          style={{ height: 20, minWidth: 20, paddingHorizontal: 4 }}
        >
          <Text className="text-[10px] font-bold text-surface-light dark:text-surface-dark">
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
