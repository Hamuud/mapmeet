import { useState } from 'react';

import { useT } from '@/i18n';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useToast } from '@/components/ui/Toast';
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
  const t = useT();
  const toast = useToast();
  const removeEvent = useEventsStore((s) => s.removeEvent);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Max height only — autoHeight shrinks the sheet to its content, so
  // short peeks still hug the buttons above the tab bar. The old 0.5/
  // 0.58 caps predate posters + imported-event blurbs and clipped the
  // action buttons under the tab bar whenever both were present.
  const heightPct = 0.85;

  const handleDelete = async () => {
    if (!event) return;
    setConfirmDelete(false);
    try {
      await eventsService.remove(event.id);
      removeEvent(event.id);
      toast.show(t('events.deleted'), 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('events.couldNotDelete'), 'error');
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
        title={t('preview.deleteTitle')}
        message={t('preview.deleteMessage')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
