import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type DmMessage = {
  id: string;
  dm_id: string;
  sender_id: string;
  type: 'text' | 'invite';
  text: string | null;
  event_invite_token: string | null;
  read_by: string[];
  created_at: string;
};

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

type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
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

  async listMessages(dmId: string, limit = 100): Promise<DmMessage[]> {
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('dm_id', dmId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data as DmMessage[] | null) ?? []).reverse();
  },

  /** Send a text DM. Server enforces the 1-message-per-side rule if
   *  the two users aren't friends — the RPC raises with a message the
   *  UI surfaces verbatim ("add them as a friend to send more…"). */
  async sendText(recipientId: string, text: string): Promise<void> {
    const { error } = await supabase.rpc('send_dm', {
      p_recipient: recipientId,
      p_text: text,
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

  subscribe(
    dmId: string,
    onInsert: (msg: DmMessage) => void,
  ): RealtimeChannel {
    return supabase
      .channel(`mapmeet:dm:${dmId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `dm_id=eq.${dmId}`,
        },
        (payload) => onInsert(payload.new as DmMessage),
      )
      .subscribe();
  },

  unsubscribe(channel: RealtimeChannel): void {
    void supabase.removeChannel(channel);
  },
};
