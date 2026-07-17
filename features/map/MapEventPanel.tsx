import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useToast } from '@/components/ui/Toast';
import { EventPreviewBody } from '@/features/events/EventPreviewBody';
import { useIconColor } from '@/hooks/useIconColor';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import type { EventWithCreator, LatLng } from '@/types';

type Props = {
  event: EventWithCreator;
  viewerLocation?: LatLng | null;
  onClose: () => void;
  onEdit?: (event: EventWithCreator) => void;
  onDirections?: (event: EventWithCreator) => void;
  onViewHost?: (event: EventWithCreator) => void;
  onOpenChat?: (event: EventWithCreator) => void;
};

/** Desktop-only replacement for the MapSidebar when a pin is picked.
 *  Occupies the same left-rail slot (`left-5 top-5 bottom-5 w-[330px]`)
 *  as MapSidebar, so the map screen just swaps one for the other in
 *  place — no overlapping panels, no camera-shifting bottom sheet. A
 *  close chip in the header returns to the events list. */
export function MapEventPanel({
  event,
  viewerLocation,
  onClose,
  onEdit,
  onDirections,
  onViewHost,
  onOpenChat,
}: Props) {
  const toast = useToast();
  const iconColor = useIconColor();
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await eventsService.remove(event.id);
      removeEvent(event.id);
      toast.show('Event deleted.', 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not delete', 'error');
    }
  };

  return (
    <>
      <View
        className="absolute left-5 top-5 bottom-5 w-[330px] flex-col overflow-hidden rounded-3xl border border-border-light bg-panel-light shadow-lg shadow-black/25 dark:border-border-dark dark:bg-panel-dark"
        pointerEvents="box-none"
      >
        {/* Header row — close chip returns to the events list. */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            Event details
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close event details"
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
          >
            <Ionicons name="close" size={14} color={iconColor} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 4 }}
          showsVerticalScrollIndicator={false}
        >
          <EventPreviewBody
            event={event}
            viewerLocation={viewerLocation}
            onEdit={onEdit}
            onDirections={onDirections}
            onDelete={() => setConfirmDelete(true)}
            onViewHost={onViewHost}
            onOpenChat={onOpenChat}
          />
        </ScrollView>
      </View>

      <ConfirmationDialog
        open={confirmDelete}
        title="Delete event?"
        message="This can't be undone. Attendees will lose their spot."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
