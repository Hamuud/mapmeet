import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type { MessageWithSender } from '@/types';

export type DmMessage = {
  id: string;
  dm_id: string;
  sender_id: string;
  type: 'text' | 'invite' | 'audio';
  text: string | null;
  event_invite_token: string | null;
  reply_to: string | null;
  reactions: Record<string, string[]>;
  media_url: string | null;
  duration_ms: number | null;
  waveform: number[] | null;
  read_by: string[];
  created_at: string;
};

type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

/** Adapt a dm_messages row to the shared MessageWithSender shape so DMs
 *  reuse the same MessageBubble as events + groups (replies, reactions,
 *  voice). `invite`-type rows fall back to text rendering. */
function toMessage(row: DmMessage, sender: ProfileLite | null): MessageWithSender {
  return {
    id: row.id,
    event_id: row.dm_id,
    sender_id: row.sender_id,
    type: row.type === 'invite' ? 'text' : row.type,
    text: row.type === 'invite' ? '🎟 Event invite' : row.text,
    media_url: row.media_url,
    latitude: null,
    longitude: null,
    reply_to: row.reply_to,
    reactions: row.reactions ?? {},
    duration_ms: row.duration_ms,
    waveform: row.waveform,
    read_by: row.read_by,
    deleted_for: [],
    hidden: false,
    created_at: row.created_at,
    sender,
  } as unknown as MessageWithSender;
}

async function uploadDmAudio(dmId: string, senderId: string, fileUri: string): Promise<string> {
  const ext = fileUri.startsWith('blob:')
    ? 'webm'
    : (fileUri.split('.').pop()?.toLowerCase() ?? 'm4a');
  const path = `dm/${dmId}/${Date.now()}_${senderId}.${ext}`;
  const blob = await (await fetch(fileUri)).arrayBuffer();
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, blob, { contentType: ext === 'webm' ? 'audio/webm' : 'audio/mp4' });
  if (error) throw error;
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

/** DM room + resolved "other" profile — what the Chat tab's Direct
 *  folder needs to render one row per conversation. Last message +
 *  unread count are optional; the tab paints without them and fills
 *  in when the previews query lands. */
export type DmRoom = {
  id: string;
  other: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  lastMessage: DmMessage | null;
  unreadCount: number;
};

export const dmsService = {
  /** Look up (or create) the 1:1 room between the viewer and another
   *  user. Idempotent — same pair always resolves to one row. */
  async ensureRoom(otherId: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_or_create_dm', {
      p_other: otherId,
    });
    if (error) throw error;
    return data as string;
  },

  /** Messages for a room, mapped to the shared bubble shape. */
  async listMessages(dmId: string, limit = 100): Promise<MessageWithSender[]> {
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*, sender:sender_id (id, username, display_name, avatar_url)')
      .eq('dm_id', dmId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as Array<DmMessage & { sender: ProfileLite | null }>)
      .reverse()
      .map((row) => toMessage(row, row.sender));
  },

  /** Send a text DM. Server enforces the 1-message-per-side rule if
   *  the two users aren't friends — the RPC raises with a message the
   *  UI surfaces verbatim ("add them as a friend to send more…"). */
  async sendText(recipientId: string, text: string, replyTo?: string | null): Promise<void> {
    const { error } = await supabase.rpc('send_dm', {
      p_recipient: recipientId,
      p_text: text,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
  },

  async sendVoice(
    recipientId: string,
    dmId: string,
    senderId: string,
    fileUri: string,
    durationMs: number,
    waveform: number[] | null,
    replyTo?: string | null,
  ): Promise<void> {
    const url = await uploadDmAudio(dmId, senderId, fileUri);
    const { error } = await supabase.rpc('send_dm_voice', {
      p_recipient: recipientId,
      p_media_url: url,
      p_duration_ms: Math.max(1, Math.round(durationMs)),
      p_waveform: waveform,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const { error } = await supabase.rpc('toggle_dm_reaction', {
      p_message_id: messageId,
      p_emoji: emoji,
    });
    if (error) throw error;
  },

  async markRead(dmId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_dm_read', { p_dm: dmId });
    if (error) throw error;
  },

  /** One row per DM the viewer belongs to — for the Chat tab's Direct
   *  segment. Loads only the other person's profile + a snippet, not
   *  the whole history. */
  async listRooms(viewerId: string): Promise<DmRoom[]> {
    const { data, error } = await supabase
      .from('dms')
      .select(
        `id,
         user_a_profile:user_a (id, username, display_name, avatar_url),
         user_b_profile:user_b (id, username, display_name, avatar_url)`,
      )
      .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rooms: DmRoom[] = (data ?? []).map((row: Record<string, unknown>) => {
      const a = row.user_a_profile as ProfileLite;
      const b = row.user_b_profile as ProfileLite;
      return {
        id: row.id as string,
        other: a.id === viewerId ? b : a,
        lastMessage: null,
        unreadCount: 0,
      };
    });
    if (rooms.length === 0) return rooms;
    // Bounded scan of the recent-messages window — cheap for a
    // handful of DMs, and the tab shows a snippet, not history.
    const { data: preview, error: pErr } = await supabase
      .from('dm_messages')
      .select('*')
      .in(
        'dm_id',
        rooms.map((r) => r.id),
      )
      .order('created_at', { ascending: false })
      .limit(400);
    if (pErr) throw pErr;
    for (const row of ((preview as DmMessage[] | null) ?? [])) {
      const room = rooms.find((r) => r.id === row.dm_id);
      if (!room) continue;
      if (!room.lastMessage) room.lastMessage = row;
      if (row.sender_id !== viewerId && !row.read_by.includes(viewerId)) {
        room.unreadCount += 1;
      }
    }
    rooms.sort((x, y) => {
      const tx = x.lastMessage?.created_at ?? '';
      const ty = y.lastMessage?.created_at ?? '';
      return ty.localeCompare(tx);
    });
    return rooms;
  },

  /** Fires on any change (new message, reaction, read receipt). */
  subscribe(dmId: string, onChange: () => void): RealtimeChannel {
    return supabase
      .channel(`mapmeet:dm:${dmId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_messages',
          filter: `dm_id=eq.${dmId}`,
        },
        () => onChange(),
      )
      .subscribe();
  },

  unsubscribe(channel: RealtimeChannel): void {
    void supabase.removeChannel(channel);
  },
};
