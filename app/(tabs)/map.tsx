import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Map, MapStyleSwitcher, type MapRef, type MapStyle } from '@/components/map';
import { FilterBar } from '@/components/events/FilterBar';
import { SearchBar } from '@/components/events/SearchBar';
import { ClusterPickerSheet } from '@/features/events/ClusterPickerSheet';
import { CreateEventSheet } from '@/features/events/CreateEventSheet';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { EventPreviewSheet } from '@/features/events/EventPreviewSheet';
import { filterEvents } from '@/features/events/filterEvents';
import { DEMO_CENTER } from '@/features/map/demo-events';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { routingService, type Route } from '@/services/routing.service';
import { useEventsStore } from '@/store/events.store';
import { useFiltersStore } from '@/store/filters.store';
import { useToast } from '@/components/ui/Toast';
import { formatDistance } from '@/utils/distance';
import { formatDuration } from '@/utils/duration';
import type { EventWithCreator, LatLng } from '@/types';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const events = useEventsStore((s) => s.events);
  const selectedEventId = useEventsStore((s) => s.selectedEventId);
  const selectEvent = useEventsStore((s) => s.selectEvent);

  const query = useFiltersStore((s) => s.query);
  const setQuery = useFiltersStore((s) => s.setQuery);
  const filter = useFiltersStore((s) => s.filter);
  const setFilter = useFiltersStore((s) => s.setFilter);

  const { coords } = useLocation();
  const mapRef = useRef<MapRef | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<LatLng | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [editEvent, setEditEvent] = useState<EventWithCreator | null>(null);

  const [mapStyle, setMapStyle] = useState<MapStyle>('streets');

  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);

  const [clusterEvents, setClusterEvents] = useState<EventWithCreator[] | null>(null);

  const visibleEvents = useMemo(
    () => filterEvents({ events, viewerId, filter, query, coords }),
    [events, viewerId, filter, query, coords],
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const handlePickLocation = useCallback((c: LatLng) => {
    setPendingCoords(c);
    setPickMode(false);
    setCreateOpen(true);
    mapRef.current?.animateTo(c);
  }, []);

  const armPickMode = () => {
    setCreateOpen(false);
    setPickMode(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setPendingCoords(null);
    setPickMode(false);
  };

  const handleDirections = useCallback(
    async (target: EventWithCreator) => {
      if (!coords) {
        toast.show('Enable location to get directions.', 'error');
        return;
      }
      selectEvent(null); // close the preview sheet
      setRouting(true);
      try {
        const result = await routingService.route(coords, {
          latitude: target.latitude,
          longitude: target.longitude,
        });
        setRoute(result);
        // Frame the whole route with a bit of padding on top for the overlay.
        mapRef.current?.fitToPoints(result.geometry, 80);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'No route found.', 'error');
      } finally {
        setRouting(false);
      }
    },
    [coords, selectEvent, toast],
  );

  const clearRoute = () => setRoute(null);

  return (
    <View className="flex-1 bg-surface-light dark:bg-surface-dark">
      <Map
        ref={mapRef}
        events={visibleEvents}
        initialCenter={coords ?? DEMO_CENTER}
        userLocation={coords}
        selectedEventId={selectedEventId}
        pendingCoords={pendingCoords}
        pickMode={pickMode}
        mapStyle={mapStyle}
        route={route?.geometry ?? null}
        onMarkerPress={selectEvent}
        onClusterTap={setClusterEvents}
        onPickLocation={handlePickLocation}
      />

      {/* Top overlay: search + filters (hidden during pickMode). */}
      {!pickMode ? (
        <View
          pointerEvents="box-none"
          style={{ paddingTop: insets.top + 8 }}
          className="absolute inset-x-0 top-0"
        >
          <View className="px-4">
            <SearchBar value={query} onChangeText={setQuery} />
          </View>
          <View className="mt-3 px-2">
            <FilterBar value={filter} onChange={setFilter} />
          </View>
        </View>
      ) : null}

      {/* Pick-mode banner */}
      {pickMode ? (
        <View
          pointerEvents="box-none"
          style={{ paddingTop: insets.top + 12 }}
          className="absolute inset-x-0 top-0 items-center px-4"
        >
          <View className="w-full max-w-md flex-row items-center gap-3 rounded-2xl bg-brand-500 px-4 py-3 shadow-lg shadow-brand-500/40">
            <Ionicons name="hand-left" size={18} color="#fff" />
            <Text className="flex-1 text-sm font-semibold text-white">
              Tap the map to pin the event
            </Text>
            <Pressable
              onPress={() => {
                setPickMode(false);
                setCreateOpen(true);
              }}
              className="rounded-full bg-white/25 px-3 py-1"
            >
              <Text className="text-xs font-semibold text-white">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Route summary — floats above the FABs so distance + ETA stay
          visible while the user pans the map. */}
      {route ? (
        <View
          pointerEvents="box-none"
          style={{ paddingTop: insets.top + 8 }}
          className="absolute inset-x-0 top-0 items-center px-4"
        >
          <View className="w-full max-w-md flex-row items-center gap-3 rounded-2xl bg-brand-500 px-4 py-3 shadow-lg shadow-brand-500/40">
            <Ionicons name="navigate" size={18} color="#fff" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-white">
                {formatDuration(route.durationSeconds)} ·{' '}
                {formatDistance(route.distanceMeters / 1000)}
              </Text>
              <Text className="text-[11px] text-white/80">
                Driving route from your location
              </Text>
            </View>
            <Pressable
              onPress={clearRoute}
              className="rounded-full bg-white/25 px-3 py-1"
            >
              <Text className="text-xs font-semibold text-white">Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Map style switcher — sits below the top chrome, above the FABs. */}
      <View
        pointerEvents="box-none"
        style={{ top: insets.top + (pickMode || route ? 68 : 108) }}
        className="absolute right-4"
      >
        <MapStyleSwitcher value={mapStyle} onChange={setMapStyle} />
      </View>

      {/* Floating locate button */}
      <View
        pointerEvents="box-none"
        className="absolute right-4"
        style={{ bottom: insets.bottom + 160 }}
      >
        <Pressable
          onPress={() => {
            if (coords) mapRef.current?.animateTo(coords, 14);
          }}
          className="h-12 w-12 items-center justify-center rounded-full border border-border-light bg-white/95 shadow-md shadow-black/25 dark:border-border-dark dark:bg-elevated-dark"
          accessibilityLabel="Recenter"
        >
          <Ionicons name="navigate" size={20} color="#3757FF" />
        </Pressable>
      </View>

      {/* Floating create-event button */}
      <View
        pointerEvents="box-none"
        className="absolute right-4"
        style={{ bottom: insets.bottom + 96 }}
      >
        <Pressable
          onPress={() => {
            setPendingCoords((prev) => prev ?? coords ?? null);
            setCreateOpen(true);
          }}
          className="h-14 w-14 items-center justify-center rounded-full bg-brand-500 shadow-lg shadow-brand-500/40 active:opacity-90"
          accessibilityLabel="Create event"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>

      {routing ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 items-center"
          style={{ bottom: insets.bottom + 240 }}
        >
          <View className="rounded-full bg-black/70 px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">
              Finding the fastest route…
            </Text>
          </View>
        </View>
      ) : null}

      <EventPreviewSheet
        event={selectedEvent}
        viewerLocation={coords}
        onClose={() => selectEvent(null)}
        onEdit={(e) => {
          selectEvent(null);
          setEditEvent(e);
        }}
        onDirections={handleDirections}
      />

      <CreateEventSheet
        open={createOpen}
        onClose={closeCreate}
        pendingCoords={pendingCoords}
        onCoordsChange={setPendingCoords}
        onRequestPickLocation={armPickMode}
      />

      <EditEventSheet
        event={editEvent}
        open={!!editEvent}
        onClose={() => setEditEvent(null)}
      />

      <ClusterPickerSheet
        events={clusterEvents}
        onClose={() => setClusterEvents(null)}
        onPick={(id) => {
          setClusterEvents(null);
          selectEvent(id);
        }}
      />
    </View>
  );
}
