import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
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
            // Live view, NOT a snapshot: tracksViewChanges={false}
            // freezes the marker as a bitmap and the orbit animation
            // would never draw. Clusters are few, so the re-render cost
            // is fine — individual pins below stay snapshotted.
            tracksViewChanges
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

/** Brand indigo — the cluster circle's fill (deliberately not ink). */
const CLUSTER_BG = '#4B5FE0';
// "Barely noticeable" — 40 s per revolution. At two/three emojis this
// reads as a slow drift, not a spin; the eye picks up motion only when
// something else on screen is still.
const ORBIT_MS = 40000;

/** Cluster marker: a colored circle with the events' emojis slowly
 *  orbiting inside it. ≤5 events → one emoji each (🎫🎫 reads as "two
 *  events"); more → up to 5 distinct emojis + a count badge. The ring
 *  spins as a whole; each emoji counter-rotates to stay upright. */
function ClusterBubble({
  events,
  count,
}: {
  events: EventWithCreator[];
  count: number;
}) {
  const emojis = clusterEmojis(events);
  const showBadge = count > emojis.length;

  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: ORBIT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const n = emojis.length;
  // Slightly larger than the previous chip — the cluster reads as
  // "a group" rather than "another pin". n=1 keeps the circle so the
  // marker's identity as a cluster stays legible; the emoji just sits
  // centred.
  const size = n === 1 ? 52 : n === 2 ? 60 : n === 3 ? 68 : n === 4 ? 74 : 80;
  const radius = n === 1 ? 0 : size / 2 - 16;

  return (
    <View>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: CLUSTER_BG,
          borderWidth: 2,
          borderColor: 'rgba(253,252,248,0.95)',
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { transform: [{ rotate }] }]}
        >
          {emojis.map((emoji, i) => {
            const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
            // -2 keeps the ring centred inside the 2px border box.
            const x = size / 2 - 2 + radius * Math.cos(angle);
            const y = size / 2 - 2 + radius * Math.sin(angle);
            return (
              <Animated.View
                key={`${emoji}-${i}`}
                style={{
                  position: 'absolute',
                  left: Math.round(x - 11),
                  top: Math.round(y - 11),
                  width: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ rotate: counterRotate }],
                }}
              >
                <Text style={{ fontSize: 14, lineHeight: 18 }}>{emoji}</Text>
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>
      {showBadge ? (
        <View
          className="absolute -right-1 -top-1 items-center justify-center rounded-full bg-text-light dark:bg-text-dark"
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
