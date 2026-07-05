import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Map, MapStyleSwitcher, type MapRef, type MapStyle } from '@/components/map';
import { FilterBar } from '@/components/events/FilterBar';
import { SearchBar } from '@/components/events/SearchBar';
import { ClusterPickerSheet } from '@/features/events/ClusterPickerSheet';
import { CreateEventSheet } from '@/features/events/CreateEventSheet';
import { DirectionsSheet } from '@/features/events/DirectionsSheet';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { EventPreviewSheet } from '@/features/events/EventPreviewSheet';
import { filterEvents } from '@/features/events/filterEvents';
import { DEMO_CENTER } from '@/features/map/demo-events';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { useEventsStore } from '@/store/events.store';
import { useFiltersStore } from '@/store/filters.store';
import type { EventWithCreator, LatLng } from '@/types';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
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
  const [clusterEvents, setClusterEvents] = useState<EventWithCreator[] | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<EventWithCreator | null>(null);

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
    (target: EventWithCreator) => {
      selectEvent(null);
      setDirectionsTarget(target);
    },
    [selectEvent],
  );

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
          <View className="mt-2.5 px-2">
            <FilterBar value={filter} onChange={setFilter} />
          </View>
        </View>
      ) : null}

      {/* Pick-mode banner — now uses ink, not brand, to stay monochrome. */}
      {pickMode ? (
        <View
          pointerEvents="box-none"
          style={{ paddingTop: insets.top + 12 }}
          className="absolute inset-x-0 top-0 items-center px-4"
        >
          <View className="w-full max-w-md flex-row items-center gap-3 rounded-xl bg-text-light px-4 py-3 shadow-lg shadow-black/30 dark:bg-text-dark">
            <Ionicons name="hand-left" size={16} color="#F6F4EE" />
            <Text className="flex-1 text-sm font-semibold text-surface-light dark:text-surface-dark">
              Tap the map to pin the event
            </Text>
            <Pressable
              onPress={() => {
                setPickMode(false);
                setCreateOpen(true);
              }}
              className="rounded-full bg-white/20 px-3 py-1"
            >
              <Text className="text-xs font-semibold text-surface-light dark:text-surface-dark">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Map style switcher */}
      <View
        pointerEvents="box-none"
        style={{ top: insets.top + (pickMode ? 68 : 104) }}
        className="absolute right-4"
      >
        <MapStyleSwitcher value={mapStyle} onChange={setMapStyle} />
      </View>

      {/* Locate — neutral ghost button. */}
      <View
        pointerEvents="box-none"
        className="absolute right-4"
        style={{ bottom: insets.bottom + 160 }}
      >
        <Pressable
          onPress={() => {
            if (coords) mapRef.current?.animateTo(coords, 14);
          }}
          className="h-11 w-11 items-center justify-center rounded-xl border border-border-light bg-panel-light shadow-md shadow-black/20 dark:border-border-dark dark:bg-panel-dark"
          accessibilityLabel="Recenter"
        >
          <Ionicons name="navigate" size={18} color="#0E0E10" />
        </Pressable>
      </View>

      {/* Create FAB — the ONE coral touchpoint. */}
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
          className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-400 shadow-lg shadow-accent-400/50 active:opacity-90"
          accessibilityLabel="Create event"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

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

      <DirectionsSheet
        event={directionsTarget}
        onClose={() => setDirectionsTarget(null)}
      />
    </View>
  );
}
