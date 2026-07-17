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

/** Bounding box of the visible map region. */
export type Bbox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/** Hard cap on imported events pulled for one viewport. Zoomed out over
 *  a whole country the box can cover hundreds; we'd rather show a dense
 *  sample fast than stall the map. */
const VIEWPORT_LIMIT = 300;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const eventsService = {
  /** Events people pinned in the app. Small enough to hold globally —
   *  the Events/Chat/You tabs all read the store expecting every event
   *  the viewer might care about, regardless of where the map is.
   *
   *  Imported events are deliberately NOT here: there can be hundreds
   *  a week across a country, so they load per-viewport instead
   *  (`listExternalInBbox`) and per-membership (`listJoinedExternal`). */
  async list(viewerId: string | null): Promise<EventWithCreator[]> {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .eq('source', 'user')
      .order('event_date', { ascending: true });
    if (error) throw error;
    return (data as unknown as RawEventRow[]).map((row) =>
      toEventWithCreator(row, viewerId),
    );
  },

  /** Imported events the viewer joined. These must stay loaded wherever
   *  the map happens to be pointing — otherwise panning away from Lviv
   *  would empty the chat you're in and hide it from My Events. */
  async listJoinedExternal(viewerId: string): Promise<EventWithCreator[]> {
    const { data: rows, error: pErr } = await supabase
      .from('participants')
      .select('event_id')
      .eq('user_id', viewerId);
    if (pErr) throw pErr;
    const ids = (rows ?? []).map((r) => r.event_id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .in('id', ids)
      .neq('source', 'user');
    if (error) throw error;
    return (data as unknown as RawEventRow[]).map((row) =>
      toEventWithCreator(row, viewerId),
    );
  },

  /** Imported events inside the visible region, upcoming only.
   *
   *  This is the "if you're looking at Lviv you get Lviv" rule: the app
   *  never holds the whole country's listings, it asks for the box on
   *  screen. Past events are filtered server-side so the payload stays
   *  about what's actually ahead. */
  async listExternalInBbox(
    viewerId: string | null,
    bbox: Bbox,
    limit = VIEWPORT_LIMIT,
  ): Promise<EventWithCreator[]> {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .neq('source', 'user')
      .gte('latitude', bbox.minLat)
      .lte('latitude', bbox.maxLat)
      .gte('longitude', bbox.minLng)
      .lte('longitude', bbox.maxLng)
      .gte('event_date', todayISO())
      .order('event_date', { ascending: true })
      .limit(limit);
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
