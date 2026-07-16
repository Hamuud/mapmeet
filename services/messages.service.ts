import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type { Message, MessageWithSender } from '@/types';

/** PostgREST embed for the sender profile. Kept identical between the
 *  list fetch and the single-row refetch the realtime handler does, so
 *  both paths produce the same MessageWithSender shape. */
const SELECT_MESSAGE = `
  *,
  sender:sender_id (id, username, display_name, avatar_url)
`;

/** A chat-list preview: the newest message per chat plus how many the
 *  viewer hasn't read yet. Computed from one bounded query — good
 *  enough until chats get long enough to need a server-side view. */
export type ChatPreview = {
  eventId: string;
  lastMessage: Message | null;
  unreadCount: number;
};

export const messagesService = {
  /** Last `limit` messages for one chat, oldest → newest. */
  async list(eventId: string, limit = 100): Promise<MessageWithSender[]> {
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_MESSAGE)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data as unknown as MessageWithSender[]) ?? []).reverse();
  },

  /** Single message with sender embed — used by the realtime handler,
   *  whose INSERT payload has no joined sender profile. */
  async getById(id: string): Promise<MessageWithSender | null> {
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_MESSAGE)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as MessageWithSender) ?? null;
  },

  async sendText(eventId: string, senderId: string, text: string): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({ event_id: eventId, sender_id: senderId, type: 'text', text })
      .select('*')
      .single();
    if (error) throw error;
    return data as Message;
  },

  async sendLocation(
    eventId: string,
    senderId: string,
    latitude: number,
    longitude: number,
  ): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        sender_id: senderId,
        type: 'location',
        latitude,
        longitude,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Message;
  },

  /** Upload a photo/video to the chat-media bucket, then post the
   *  message. Path: `<event_id>/<timestamp>_<user_id>.<ext>`. */
  async sendMedia(
    eventId: string,
    senderId: string,
    fileUri: string,
    type: 'image' | 'video',
  ): Promise<Message> {
    const ext = fileUri.split('.').pop()?.toLowerCase() ?? (type === 'image' ? 'jpg' : 'mp4');
    const path = `${eventId}/${Date.now()}_${senderId}.${ext}`;
    const response = await fetch(fileUri);
    const blob = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(path, blob, {
        contentType: type === 'image' ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : `video/${ext}`,
      });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        sender_id: senderId,
        type,
        media_url: urlData.publicUrl,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Message;
  },

  /** Mark everything in the chat read by the current user (RPC —
   *  clients have no UPDATE grant on messages). */
  async markRead(eventId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_messages_read', {
      p_event_id: eventId,
    });
    if (error) throw error;
  },

  /** Soft "delete for me". */
  async deleteForMe(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_message_for_me', {
      p_message_id: messageId,
    });
    if (error) throw error;
  },

  /** Host-only: hide a message for everyone. */
  async hide(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('hide_message', { p_message_id: messageId });
    if (error) throw error;
  },

  /** Host-only: kick a member out of the event + chat. The DB trigger
   *  posts the "<name> was removed from the event" system message. */
  async removeParticipant(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_participant', {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) throw error;
  },

  /** Chat-list previews for a set of chats in one query: newest message
   *  and unread count per event. Bounded at `scanLimit` recent rows
   *  across all chats — the badge saturates rather than the query
   *  growing with history. */
  async previews(
    eventIds: string[],
    viewerId: string,
    scanLimit = 400,
  ): Promise<Map<string, ChatPreview>> {
    const out = new Map<string, ChatPreview>();
    if (eventIds.length === 0) return out;
    const { data, error } = await supabase
      .from('messages')
      .select('id, event_id, sender_id, type, text, media_url, read_by, hidden, created_at')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false })
      .limit(scanLimit);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as Message[]) {
      const existing = out.get(row.event_id) ?? {
        eventId: row.event_id,
        lastMessage: null,
        unreadCount: 0,
      };
      if (!existing.lastMessage && !row.hidden) existing.lastMessage = row;
      if (
        !row.hidden &&
        row.type !== 'system' &&
        row.sender_id !== viewerId &&
        !row.read_by.includes(viewerId)
      ) {
        existing.unreadCount += 1;
      }
      out.set(row.event_id, existing);
    }
    return out;
  },

  /** Realtime feed for one chat. INSERTs arrive without the sender
   *  embed, so the handler refetches the row by id before invoking the
   *  callback — same enrichment pattern the events store uses. UPDATEs
   *  (read receipts, hides, soft deletes) are forwarded raw.
   *  postgres_changes respects RLS, so non-members receive nothing. */
  subscribe(
    eventId: string,
    handlers: {
      onInsert: (message: MessageWithSender) => void;
      onUpdate?: (message: Message) => void;
    },
  ): RealtimeChannel {
    const channel = supabase
      .channel(`mapmeet:chat:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const enriched = await messagesService.getById(
            (payload.new as { id: string }).id,
          );
          if (enriched) handlers.onInsert(enriched);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          handlers.onUpdate?.(payload.new as Message);
        },
      )
      .subscribe();
    return channel;
  },

  /** Realtime feed across ALL chats the viewer can see (RLS-scoped) —
   *  powers the chat list's live previews + unread badges. */
  subscribeAll(onInsert: (message: Message) => void): RealtimeChannel {
    const channel = supabase
      .channel('mapmeet:chat:all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => onInsert(payload.new as Message),
      )
      .subscribe();
    return channel;
  },

  unsubscribe(channel: RealtimeChannel): void {
    void supabase.removeChannel(channel);
  },
};
