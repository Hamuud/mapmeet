import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type { MessageWithSender } from '@/types';

/** A group message row, before we adapt it to the shared bubble shape. */
type GroupMessageRow = {
  id: string;
  group_id: string;
  sender_id: string | null;
  type: 'text' | 'audio' | 'system';
  text: string | null;
  reply_to: string | null;
  reactions: Record<string, string[]>;
  media_url: string | null;
  duration_ms: number | null;
  waveform: number[] | null;
  read_by: string[];
  deleted_for: string[];
  created_at: string;
};

type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type GroupRoom = {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  lastMessage: GroupMessageRow | null;
  unreadCount: number;
};

export type GroupMember = ProfileLite;

/** Adapt a group_messages row to the MessageWithSender shape the chat
 *  bubbles render. Group chats now carry the same reply / reactions /
 *  voice fields as event messages, so these map straight across; the
 *  couple of event-only columns (image/video/location) stay null. */
function toMessage(row: GroupMessageRow, sender: ProfileLite | null): MessageWithSender {
  return {
    id: row.id,
    event_id: row.group_id, // reused as the bubble's grouping id
    sender_id: row.sender_id,
    type: row.type,
    text: row.text,
    media_url: row.media_url,
    latitude: null,
    longitude: null,
    reply_to: row.reply_to,
    reactions: row.reactions ?? {},
    duration_ms: row.duration_ms,
    waveform: row.waveform,
    read_by: row.read_by,
    deleted_for: row.deleted_for,
    hidden: false,
    created_at: row.created_at,
    sender: sender,
  } as unknown as MessageWithSender;
}

/** Upload a recorded voice note to the shared chat-media bucket, keyed
 *  under the group id. Mirrors the event chat's audio upload. */
async function uploadGroupAudio(
  groupId: string,
  senderId: string,
  fileUri: string,
): Promise<string> {
  const ext = fileUri.startsWith('blob:')
    ? 'webm'
    : (fileUri.split('.').pop()?.toLowerCase() ?? 'm4a');
  const path = `group/${groupId}/${Date.now()}_${senderId}.${ext}`;
  const blob = await (await fetch(fileUri)).arrayBuffer();
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, blob, {
      contentType: ext === 'webm' ? 'audio/webm' : 'audio/mp4',
    });
  if (error) throw error;
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

export const groupsService = {
  /** Create a group with the caller + chosen friends. Returns the id. */
  async create(name: string, emoji: string, memberIds: string[]): Promise<string> {
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name,
      p_emoji: emoji,
      p_member_ids: memberIds,
    });
    if (error) throw error;
    return data as string;
  },

  async getById(groupId: string): Promise<{ id: string; name: string; emoji: string } | null> {
    const { data, error } = await supabase
      .from('group_chats')
      .select('id, name, emoji')
      .eq('id', groupId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async listMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase
      .from('group_members')
      .select('profile:profiles!group_members_user_id_fkey (id, username, display_name, avatar_url)')
      .eq('group_id', groupId);
    if (error) throw error;
    return (data ?? [])
      .map((r: Record<string, unknown>) => r.profile as ProfileLite)
      .filter((p): p is ProfileLite => !!p);
  },

  async listMessages(groupId: string, limit = 100): Promise<MessageWithSender[]> {
    const { data, error } = await supabase
      .from('group_messages')
      .select(
        `*, sender:sender_id (id, username, display_name, avatar_url)`,
      )
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as Array<GroupMessageRow & { sender: ProfileLite | null }>)
      .reverse()
      .map((row) => toMessage(row, row.sender));
  },

  async send(groupId: string, text: string, replyTo?: string | null): Promise<void> {
    const { error } = await supabase.rpc('send_group_message', {
      p_group: groupId,
      p_text: text,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
  },

  /** Record → upload → post a voice note in the group. */
  async sendVoice(
    groupId: string,
    senderId: string,
    fileUri: string,
    durationMs: number,
    waveform: number[] | null,
    replyTo?: string | null,
  ): Promise<void> {
    const url = await uploadGroupAudio(groupId, senderId, fileUri);
    const { error } = await supabase.rpc('send_group_voice', {
      p_group: groupId,
      p_media_url: url,
      p_duration_ms: Math.max(1, Math.round(durationMs)),
      p_waveform: waveform,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const { error } = await supabase.rpc('toggle_group_reaction', {
      p_message_id: messageId,
      p_emoji: emoji,
    });
    if (error) throw error;
  },

  async markRead(groupId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_group_read', { p_group: groupId });
    if (error) throw error;
  },

  async addMembers(groupId: string, memberIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('add_group_members', {
      p_group: groupId,
      p_member_ids: memberIds,
    });
    if (error) throw error;
  },

  async leave(groupId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_group', { p_group: groupId });
    if (error) throw error;
  },

  // ── Rooms list (Chat tab, Direct folder) ──────────────────────────────
  async listRooms(viewerId: string): Promise<GroupRoom[]> {
    const { data: memberships, error: mErr } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', viewerId);
    if (mErr) throw mErr;
    const ids = (memberships ?? []).map((r) => r.group_id);
    if (ids.length === 0) return [];

    const { data: groups, error: gErr } = await supabase
      .from('group_chats')
      .select('id, name, emoji')
      .in('id', ids);
    if (gErr) throw gErr;

    const [{ data: memberCounts }, { data: preview }] = await Promise.all([
      supabase.from('group_members').select('group_id').in('group_id', ids),
      supabase
        .from('group_messages')
        .select('id, group_id, sender_id, type, text, read_by, deleted_for, created_at')
        .in('group_id', ids)
        .order('created_at', { ascending: false })
        .limit(400),
    ]);

    const counts = new Map<string, number>();
    for (const r of memberCounts ?? [])
      counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);

    const rooms: GroupRoom[] = (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      memberCount: counts.get(g.id) ?? 1,
      lastMessage: null,
      unreadCount: 0,
    }));
    const byId = new Map(rooms.map((r) => [r.id, r]));
    for (const row of ((preview ?? []) as GroupMessageRow[])) {
      const room = byId.get(row.group_id);
      if (!room) continue;
      if (!room.lastMessage) room.lastMessage = row;
      if (
        row.type !== 'system' &&
        row.sender_id !== viewerId &&
        !row.read_by.includes(viewerId)
      ) {
        room.unreadCount += 1;
      }
    }
    return rooms;
  },

  // ── Share links ───────────────────────────────────────────────────────
  async createInvite(groupId: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_group_invite', {
      p_group: groupId,
    });
    if (error) throw error;
    return data as string;
  },

  async previewInvite(token: string) {
    const { data, error } = await supabase.rpc('get_group_invite', {
      p_token: token,
    });
    if (error) throw error;
    return (
      (data as
        | Array<{
            group_id: string;
            group_name: string;
            group_emoji: string;
            member_count: number;
            inviter_display_name: string;
            inviter_username: string;
            expires_at: string;
            expired: boolean;
          }>
        | null) ?? []
    )[0] ?? null;
  },

  async acceptInvite(token: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_group_invite', {
      p_token: token,
    });
    if (error) throw error;
    return data as string;
  },

  /** Fires on any change (INSERT for new messages, UPDATE for reactions
   *  / read receipts) so the room can refetch. */
  subscribe(groupId: string, onChange: () => void): RealtimeChannel {
    return supabase
      .channel(`mapmeet:group:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        () => onChange(),
      )
      .subscribe();
  },

  unsubscribe(channel: RealtimeChannel): void {
    void supabase.removeChannel(channel);
  },
};
