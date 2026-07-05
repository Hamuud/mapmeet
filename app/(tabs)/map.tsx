import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { MapSidebar } from '@/features/map/MapSidebar';
import { MapZoomStack } from '@/features/map/MapZoomStack';
import { useAuth } from '@/hooks/useAuth';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocation } from '@/hooks/useLocation';
import { useEventsStore } from '@/store/events.store';
import { useFiltersStore } from '@/store/filters.store';
import type { EventWithCreator, LatLng } from '@/types';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const events = useEventsStore((s) => s.events);
  const selectedEventId = useEventsStore((s) => s.selectedEventId);
  const selectEvent = useEventsStore((s) => s.selectEvent);
  const focusedEventId = useEventsStore((s) => s.focusedEventId);
  const focusEvent = useEventsStore((s) => s.focusEvent);

  const query = useFiltersStore((s) => s.query);
  const setQuery = useFiltersStore((s) => s.setQuery);
  const filter = useFiltersStore((s) => s.filter);
  const setFilter = useFiltersStore((s) => s.setFilter);

  const { coords } = useLocation();
  const mapRef = useRef<MapRef | null>(null);

  // Auto-recenter on the user's location as soon as we get it. Ref-guarded
  // so we only do this on the first fix per session — after that we
  // respect any manual panning the user has done. Also fires only when
  // the user hasn't already selected an event (a marker tap will fly the
  // camera to that pin, and we shouldn't wrestle it back).
  const hasCenteredOnUser = useRef(false);
  useEffect(() => {
    // Skip the auto-recenter if the user just tapped a marker or asked
    // for a focused fly-to from My Events — both drive the camera to
    // somewhere specific, and we shouldn't wrestle it back.
    if (!coords || hasCenteredOnUser.current || selectedEventId || focusedEventId) {
      return;
    }
    // Small timeout so the map has committed its initial region first —
    // animating during the same tick as mount is a no-op on iOS.
    const t = setTimeout(() => {
      mapRef.current?.animateTo(coords, 14);
      hasCenteredOnUser.current = true;
    }, 250);
    return () => clearTimeout(t);
  }, [coords, selectedEventId, focusedEventId]);

  // "View on map" from My Events sets focusedEventId. Fly the camera to
  // it without opening the preview sheet, then clear the focus so the
  // next tab visit doesn't refocus.
  useEffect(() => {
    if (!focusedEventId) return;
    const target = events.find((e) => e.id === focusedEventId);
    if (!target) return;
    const t = setTimeout(() => {
      mapRef.current?.animateTo(
        { latitude: target.latitude, longitude: target.longitude },
        15,
      );
      focusEvent(null);
    }, 250);
    return () => clearTimeout(t);
  }, [focusedEventId, events, focusEvent]);

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
        onMarkerPress={(id) => {
          // Close any other sheet before opening the preview — two
          // overlapping sheets rendered fragments in weird positions.
          setCreateOpen(false);
          setEditEvent(null);
          setClusterEvents(null);
          setDirectionsTarget(null);
          selectEvent(id);
        }}
        onClusterTap={(list) => {
          setCreateOpen(false);
          setEditEvent(null);
          selectEvent(null);
          setClusterEvents(list);
        }}
        onPickLocation={handlePickLocation}
      />

      {/* Desktop left rail — replaces the mobile top overlay. */}
      {isDesktop && !pickMode ? (
        <MapSidebar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          events={visibleEvents}
          selectedEventId={selectedEventId}
          onEventPress={selectEvent}
        />
      ) : null}

      {/* Mobile top overlay: search + filters (hidden during pickMode). */}
      {!isDesktop && !pickMode ? (
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
        style={{ top: isDesktop ? 20 : insets.top + (pickMode ? 68 : 104) }}
        className={isDesktop ? 'absolute right-5' : 'absolute right-4'}
      >
        <MapStyleSwitcher value={mapStyle} onChange={setMapStyle} />
      </View>

      {/* Desktop: custom zoom stack on the right, coral create FAB
          bottom-right with a "Drop a pin to create" hint pill. */}
      {isDesktop ? (
        <>
          <View
            pointerEvents="box-none"
            className="absolute right-5"
            style={{ top: 72 }}
          >
            <MapZoomStack
              onZoomIn={() => mapRef.current?.zoomIn()}
              onZoomOut={() => mapRef.current?.zoomOut()}
              onLocate={() => coords && mapRef.current?.animateTo(coords, 14)}
            />
          </View>

          <View
            pointerEvents="box-none"
            className="absolute bottom-6 right-6 flex-row items-center gap-3"
          >
            <View className="rounded-lg border border-border-light bg-panel-light px-3 py-2 shadow-sm shadow-black/10 dark:border-border-dark dark:bg-panel-dark">
              <Text className="font-mono text-[11px] text-ink2-light dark:text-ink2-dark">
                Drop a pin to create
              </Text>
            </View>
            <Pressable
              onPress={() => {
                // Close any other overlay first so we never end up with
                // two sheets fighting for the same bottom position.
                selectEvent(null);
                setClusterEvents(null);
                setEditEvent(null);
                setDirectionsTarget(null);
                setPendingCoords((prev) => prev ?? coords ?? null);
                setCreateOpen(true);
              }}
              className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-400 shadow-lg shadow-accent-400/50 active:opacity-90"
              accessibilityLabel="Create event"
            >
              <Ionicons name="add" size={26} color="#fff" />
            </Pressable>
          </View>
        </>
      ) : null}

      {/* Mobile bottom-right cluster. Inside a Tabs child screen,
          `bottom: 0` already sits at the tab bar's top edge — React
          Navigation offsets the child's coordinate system by the tab
          bar height. So we DON'T add insets.bottom here (doing so
          double-counted and floated the buttons up into mid-screen).
          Create FAB sits 12pt above the tab bar; Locate stacks 8pt
          above that. */}
      {!isDesktop ? (
        <>
          <View
            pointerEvents="box-none"
            className="absolute right-4"
            style={{ bottom: 76 }}
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

          <View
            pointerEvents="box-none"
            className="absolute right-4"
            style={{ bottom: 12 }}
          >
            <Pressable
              onPress={() => {
                // Close any other overlay first so we never end up with
                // two sheets fighting for the same bottom position.
                selectEvent(null);
                setClusterEvents(null);
                setEditEvent(null);
                setDirectionsTarget(null);
                setPendingCoords((prev) => prev ?? coords ?? null);
                setCreateOpen(true);
              }}
              className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-400 shadow-lg shadow-accent-400/50 active:opacity-90"
              accessibilityLabel="Create event"
            >
              <Ionicons name="add" size={26} color="#fff" />
            </Pressable>
          </View>
        </>
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

      <DirectionsSheet
        event={directionsTarget}
        onClose={() => setDirectionsTarget(null)}
      />
    </View>
  );
}
