import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Map,
  MapStyleSwitcher,
  type MapBounds,
  type MapRef,
  type MapStyle,
} from '@/components/map';
import { FilterBar } from '@/components/events/FilterBar';
import { SearchBar } from '@/components/events/SearchBar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ClusterPickerSheet } from '@/features/events/ClusterPickerSheet';
import { CreateEventSheet } from '@/features/events/CreateEventSheet';
import { DirectionsSheet } from '@/features/events/DirectionsSheet';
import { EditEventSheet } from '@/features/events/EditEventSheet';
import { EventPreviewSheet } from '@/features/events/EventPreviewSheet';
import { DateRangeSheet } from '@/features/events/DateRangeSheet';
import { filterEvents } from '@/features/events/filterEvents';
import { EventSuggestions } from '@/features/map/EventSuggestions';
import { suggestEvents } from '@/features/map/matchEvents';
import { DEMO_CENTER } from '@/features/map/demo-events';
import { MapEventPanel } from '@/features/map/MapEventPanel';
import { MapSidebar } from '@/features/map/MapSidebar';
import { MapZoomStack } from '@/features/map/MapZoomStack';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocation } from '@/hooks/useLocation';
import { useAuthWallStore } from '@/store/authWall.store';
import { useEventsStore } from '@/store/events.store';
import { useFiltersStore } from '@/store/filters.store';
import { usePreferencesStore } from '@/store/preferences.store';
import type { EventWithCreator, LatLng } from '@/types';

/** Is this event's pin inside the camera box? `minLng > maxLng` means the
 *  view straddles the antimeridian, where the longitude test flips to an
 *  OR of the two halves. */
function withinBounds(
  event: { latitude: number; longitude: number },
  b: MapBounds,
): boolean {
  const latOk = event.latitude >= b.minLat && event.latitude <= b.maxLat;
  if (!latOk) return false;
  return b.minLng <= b.maxLng
    ? event.longitude >= b.minLng && event.longitude <= b.maxLng
    : event.longitude >= b.minLng || event.longitude <= b.maxLng;
}

/** The Map tab.
 *
 *  Wrapped in an ErrorBoundary like Events and Chat. It matters more
 *  here than anywhere else: this screen is where every "view on map"
 *  path lands, and without a boundary a single render throw unmounts
 *  the whole tree — which reads to the user as the app going black and
 *  dying, with nothing on screen to say what happened. */
export default function MapScreen() {
  const t = useT();
  return (
    <ErrorBoundary where={t('boundary.map')}>
      <MapScreenBody />
    </ErrorBoundary>
  );
}

function MapScreenBody() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const iconColor = useIconColor();
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
  const dateRange = useFiltersStore((s) => s.dateRange);
  const setDateRange = useFiltersStore((s) => s.setDateRange);
  const nearbyRadiusKm = usePreferencesStore((s) => s.searchRadiusKm);

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
    // Nothing to fly to — the event was deleted, or it has aged out of
    // the map. Drop the focus rather than holding it: a focus that
    // never clears also suppresses the auto-recenter (below) for the
    // rest of the session, so the map stops following the user.
    if (!target) {
      focusEvent(null);
      return;
    }
    const t = setTimeout(() => {
      mapRef.current?.animateTo(
        { latitude: target.latitude, longitude: target.longitude },
        15,
      );
      focusEvent(null);
    }, 250);
    return () => clearTimeout(t);
  }, [focusedEventId, events, focusEvent]);

  // Hosting needs an identity; browsing does not. Guests get the map
  // and the previews, and meet the wall here.
  const authGuard = useAuthWallStore((s) => s.guard);

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<LatLng | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [editEvent, setEditEvent] = useState<EventWithCreator | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('streets');
  const [clusterEvents, setClusterEvents] = useState<EventWithCreator[] | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<EventWithCreator | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);

  /** Events whose name looks like what's being typed.
   *
   *  Ranked over everything loaded rather than over `visibleEvents`, so a
   *  filter chip set to Today can't hide the thing you are explicitly
   *  searching for by name. Suppressed once a suggestion is taken, so the
   *  list doesn't hang around over the pin it just flew you to. */
  const [pickedSuggestion, setPickedSuggestion] = useState(false);
  const suggestions = useMemo(
    () => (pickedSuggestion ? [] : suggestEvents(events, query)),
    [events, query, pickedSuggestion],
  );
  useEffect(() => setPickedSuggestion(false), [query]);

  /** Go to the event they meant: fly the camera there and open its peek,
   *  which is the whole point of having searched for it by name. */
  const handlePickSuggestion = useCallback(
    (event: EventWithCreator) => {
      setPickedSuggestion(true);
      mapRef.current?.animateTo(
        { latitude: event.latitude, longitude: event.longitude },
        15,
      );
      selectEvent(event.id);
    },
    [selectEvent],
  );

  /** "20 Aug – 23 Aug", in the viewer's locale, for the filter chip. */
  const dateChipLabel = useMemo(() => {
    if (!dateRange) return null;
    const short = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      if (!y || !m || !d) return iso;
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      });
    };
    return dateRange.from === dateRange.to
      ? short(dateRange.from)
      : `${short(dateRange.from)} – ${short(dateRange.to)}`;
  }, [dateRange]);

  const visibleEvents = useMemo(
    // Events whose exact venue never resolved only carry their city's
    // centroid (geo_precision === 'city'). We still pin them — at the
    // city center — so there's a marker to tap and join; the peek shows
    // the venue text and swaps Directions for "See venue above" so no one
    // is routed to a town square. Co-located city pins cluster together.
    () =>
      filterEvents({
        events,
        viewerId,
        filter,
        query,
        coords,
        nearbyRadiusKm,
        dateRange,
      }),
    [events, viewerId, filter, query, coords, nearbyRadiusKm, dateRange],
  );

  // Current camera box, tracked so the rail can say "this area" and mean
  // it. Imported events are already fetched per-viewport; user-pinned
  // ones are loaded globally, so without this the rail listed events from
  // anywhere in the world.
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null);

  const sidebarEvents = useMemo(() => {
    if (!viewBounds) return visibleEvents; // pre-first-frame: don't hide anything
    return visibleEvents.filter(
      (e) => e.source !== 'user' || withinBounds(e, viewBounds),
    );
  }, [visibleEvents, viewBounds]);

  // Imported events load for the region on screen, not the whole
  // country. Debounced so a pan fires one request when it settles, and
  // skipped in pickMode (the camera is being used to place a pin).
  const syncViewport = useEventsStore((s) => s.syncViewport);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRegionChange = useCallback(
    (bounds: MapBounds) => {
      // Track the box immediately so the rail re-scopes as you pan; only
      // the network fetch is debounced.
      setViewBounds(bounds);
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(() => {
        void syncViewport(bounds, viewerId);
      }, 400);
    },
    [syncViewport, viewerId],
  );
  useEffect(
    () => () => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
    },
    [],
  );

  // Seed the first fetch from the initial camera rather than waiting for
  // the user to pan: the web map emits bounds on `load`, but native's
  // onRegionChangeComplete isn't guaranteed to fire before the first
  // interaction. Runs once per center — syncViewport is idempotent, so
  // overlapping with the first real region change is harmless.
  const seededCenter = useRef<string | null>(null);
  useEffect(() => {
    const center = coords ?? DEMO_CENTER;
    const key = `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}`;
    if (seededCenter.current === key) return;
    seededCenter.current = key;
    void syncViewport(
      {
        minLat: center.latitude - 0.25,
        maxLat: center.latitude + 0.25,
        minLng: center.longitude - 0.25,
        maxLng: center.longitude + 0.25,
      },
      viewerId,
    );
  }, [coords, syncViewport, viewerId]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const handlePickLocation = useCallback((c: LatLng) => {
    if (!authGuard('create')) {
      setPickMode(false);
      return;
    }
    setPendingCoords(c);
    setPickMode(false);
    setCreateOpen(true);
    mapRef.current?.animateTo(c);
  }, [authGuard]);

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
        onRegionChange={handleRegionChange}
      />

      {/* Desktop left rail — either the events list (default) or the
          event details panel (when a pin is picked). Swapping in place
          keeps the rail from doubling up with an overlay sheet, which
          is what the pre-change layout did. */}
      {isDesktop && !pickMode && selectedEvent ? (
        <MapEventPanel
          event={selectedEvent}
          viewerLocation={coords}
          onClose={() => selectEvent(null)}
          onEdit={(e) => {
            selectEvent(null);
            setEditEvent(e);
          }}
          onDirections={handleDirections}
          onViewHost={(e) => {
            router.navigate({ pathname: '/user/[username]', params: { username: e.creator.username } });
          }}
          onOpenChat={(e) => {
            router.navigate({ pathname: '/chat/[id]', params: { id: e.id } });
          }}
        />
      ) : isDesktop && !pickMode ? (
        <MapSidebar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          events={sidebarEvents}
          selectedEventId={selectedEventId}
          onEventPress={selectEvent}
          dateLabel={dateChipLabel}
          onPickDates={() => setDatesOpen(true)}
        />
      ) : null}

      {/* Mobile top overlay: search + filters (hidden during pickMode). */}
      {!isDesktop && !pickMode ? (
        <View
          pointerEvents="box-none"
          // Above the style switcher: the suggestions drop down over the
          // same strip, and paint order alone put the Streets button
          // through the middle of the first result.
          style={{ paddingTop: insets.top + 8, zIndex: 20 }}
          className="absolute inset-x-0 top-0"
        >
          <View className="px-4">
            <SearchBar value={query} onChangeText={setQuery} />
            <EventSuggestions
              events={suggestions}
              viewerLocation={coords}
              onPick={handlePickSuggestion}
            />
          </View>
          <View className="mt-2.5 px-2">
            <FilterBar
              value={filter}
              onChange={setFilter}
              dateLabel={dateChipLabel}
              onPickDates={() => setDatesOpen(true)}
            />
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
              {t('map.tapToPin')}
            </Text>
            <Pressable
              onPress={() => {
                if (!authGuard('create')) return;
                setPickMode(false);
                setCreateOpen(true);
              }}
              className="rounded-full bg-white/20 px-3 py-1"
            >
              <Text className="text-xs font-semibold text-surface-light dark:text-surface-dark">
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Map style switcher */}
      <View
        pointerEvents="box-none"
        style={{
          top: isDesktop ? 20 : insets.top + (pickMode ? 68 : 104),
          zIndex: 10,
        }}
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
                {t('map.dropPinHint')}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                // Close any other overlay first so we never end up with
                // two sheets fighting for the same bottom position.
                selectEvent(null);
                if (!authGuard('create')) return;
                setClusterEvents(null);
                setEditEvent(null);
                setDirectionsTarget(null);
                setPendingCoords((prev) => prev ?? coords ?? null);
                setCreateOpen(true);
              }}
              className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-400 shadow-lg shadow-accent-400/50 active:opacity-90"
              accessibilityLabel={t('map.createEvent')}
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
              accessibilityLabel={t('map.recenter')}
            >
              <Ionicons name="navigate" size={18} color={iconColor} />
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
                if (!authGuard('create')) return;
                setClusterEvents(null);
                setEditEvent(null);
                setDirectionsTarget(null);
                setPendingCoords((prev) => prev ?? coords ?? null);
                setCreateOpen(true);
              }}
              className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-400 shadow-lg shadow-accent-400/50 active:opacity-90"
              accessibilityLabel={t('map.createEvent')}
            >
              <Ionicons name="add" size={26} color="#fff" />
            </Pressable>
          </View>
        </>
      ) : null}

      {/* Mobile / narrow-desktop bottom peek. On wide desktop the
          left-rail MapEventPanel above owns the preview instead, so
          we suppress the bottom sheet to avoid double render. */}
      <EventPreviewSheet
        event={isDesktop ? null : selectedEvent}
        viewerLocation={coords}
        onClose={() => selectEvent(null)}
        onEdit={(e) => {
          selectEvent(null);
          setEditEvent(e);
        }}
        onDirections={handleDirections}
        onViewHost={(e) => {
          router.navigate({ pathname: '/user/[username]', params: { username: e.creator.username } });
        }}
        onOpenChat={(e) => {
          selectEvent(null);
          router.navigate({ pathname: '/chat/[id]', params: { id: e.id } });
        }}
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

      {/* Pick a span of days. Applying switches the filter to 'dates';
          clearing it drops back to All, so the map is never left in a
          mode with nothing to filter by. */}
      <DateRangeSheet
        open={datesOpen}
        value={dateRange}
        onClose={() => setDatesOpen(false)}
        onApply={(range) => {
          setDateRange(range);
          setFilter(range ? 'dates' : 'all');
        }}
      />
    </View>
  );
}
