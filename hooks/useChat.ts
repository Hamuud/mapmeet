import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { messagesService } from '@/services/messages.service';
import type { Message, MessageWithSender } from '@/types';

type Status = 'loading' | 'ready' | 'error';

/** One chat room's live message feed.
 *
 *  - fetches the last 100 messages on mount
 *  - subscribes to realtime INSERT (enriched with sender) + UPDATE
 *    (read receipts / host hides / soft deletes)
 *  - marks the chat read on open and whenever a new message lands
 *    while the room is on screen
 *  - refetches on app foreground — same backup we use for events,
 *    because iOS drops realtime websockets in the background. */
export function useChat(eventId: string | null, viewerId: string | null) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [status, setStatus] = useState<Status>('loading');

  // Refs so the realtime callbacks never capture stale state.
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

  const fetchAll = useCallback(async () => {
    if (!eventIdRef.current) return;
    try {
      const rows = await messagesService.list(eventIdRef.current);
      setMessages(rows);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setStatus('loading');
    void fetchAll();
    // Opening the room clears the unread badge.
    void messagesService.markRead(eventId).catch(() => {});

    const channel = messagesService.subscribe(eventId, {
      onInsert: (message) => {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        );
        // The viewer is looking at the room — mark the incoming
        // message read right away so other clients' receipts update.
        if (message.sender_id !== viewerId) {
          void messagesService.markRead(eventId).catch(() => {});
        }
      },
      onUpdate: (row: Message) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  read_by: row.read_by,
                  deleted_for: row.deleted_for,
                  hidden: row.hidden,
                  reactions: row.reactions,
                }
              : m,
          ),
        );
      },
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchAll();
    });

    return () => {
      messagesService.unsubscribe(channel);
      sub.remove();
    };
  }, [eventId, viewerId, fetchAll]);

  return { messages, status, refetch: fetchAll };
}
