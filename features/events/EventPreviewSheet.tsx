import { useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import type { EventWithCreator, LatLng } from '@/types';
import { EventPreviewBody } from './EventPreviewBody';

type Props = {
  event: EventWithCreator | null;
  viewerLocation?: LatLng | null;
  onClose: () => void;
  onEdit?: (event: EventWithCreator) => void;
  onDirections?: (event: EventWithCreator) => void;
  onViewHost?: (event: EventWithCreator) => void;
  onOpenChat?: (event: EventWithCreator) => void;
};

/** Mobile / narrow-desktop bottom peek sheet. Wraps `EventPreviewBody`
 *  in a bottom-docked `BottomSheet`. On wide desktop the map screen
 *  swaps this out for a left-rail panel that shows the same body. */
export function EventPreviewSheet({
  event,
  viewerLocation,
  onClose,
  onEdit,
  onDirections,
  onViewHost,
  onOpenChat,
}: Props) {
  const toast = useToast();
  const { session } = useAuth();
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCreator = !!(event && session && event.creator_id === session.user.id);
  const heightPct = isCreator ? 0.58 : 0.5;

  const handleDelete = async () => {
    if (!event) return;
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
      <BottomSheet open={!!event} onClose={onClose} heightPct={heightPct} autoHeight>
        {event ? (
          <EventPreviewBody
            event={event}
            viewerLocation={viewerLocation}
            onEdit={onEdit}
            onDirections={onDirections}
            onDelete={() => setConfirmDelete(true)}
            onViewHost={onViewHost}
            onOpenChat={onOpenChat}
          />
        ) : null}
      </BottomSheet>

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
