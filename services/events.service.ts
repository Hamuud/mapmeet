import { supabase } from './supabase';
import type { Event, EventInsert, EventUpdate, EventWithCreator } from '@/types';

/** Shape returned by the joined select below — matches the PostgREST embed. */
type RawEventRow = Event & {
  creator: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  participants: { count: number }[];
  joined_by_me: { user_id: string }[];
};

const SELECT_EVENT = `
  *,
  creator:creator_id (id, username, display_name, avatar_url),
  participants:participants!participants_event_id_fkey(count),
  joined_by_me:participants!participants_event_id_fkey(user_id)
`;

/** Collapse the joined embed into the flat shape the UI wants. */
function toEventWithCreator(row: RawEventRow, viewerId: string | null): EventWithCreator {
  const { participants, joined_by_me, creator, ...event } = row;
  return {
    ...event,
    creator: creator ?? {
      id: event.creator_id,
      username: 'unknown',
      display_name: 'Unknown',
      avatar_url: null,
    },
    participant_count: participants[0]?.count ?? 0,
    is_joined:
      !!viewerId && joined_by_me.some((row) => row.user_id === viewerId),
  };
}

export const eventsService = {
  async list(viewerId: string | null): Promise<EventWithCreator[]> {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return (data as unknown as RawEventRow[]).map((row) =>
      toEventWithCreator(row, viewerId),
    );
  },

  async getById(id: string, viewerId: string | null): Promise<EventWithCreator | null> {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toEventWithCreator(data as unknown as RawEventRow, viewerId) : null;
  },

  async create(input: EventInsert): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: EventUpdate): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  },

  async join(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('participants')
      .insert({ event_id: eventId, user_id: userId });
    if (error && error.code !== '23505') throw error; // ignore unique-violation
  },

  async leave(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  /** Fetch attendee profiles for the preview sheet's avatar row. Limits
   *  to the first N so we don't pay for a giant list on popular events —
   *  the +N overflow chip in the UI covers the rest. */
  async listAttendees(
    eventId: string,
    limit = 8,
  ): Promise<Array<{ id: string; username: string; display_name: string; avatar_url: string | null }>> {
    const { data, error } = await supabase
      .from('participants')
      .select('profile:profiles!participants_user_id_fkey(id, username, display_name, avatar_url)')
      .eq('event_id', eventId)
      .order('joined_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    // PostgREST returns { profile: {...} } per row; unwrap.
    return (data ?? [])
      .map((row: any) => row.profile)
      .filter((p): p is NonNullable<typeof p> => p != null);
  },
};
