import { supabase } from './supabase';
import type { Event, EventInsert, EventUpdate, EventWithCreator } from '@/types';

/** Shape returned by the joined select below — matches the PostgREST embed. */
type RawEventRow = Event & {
  creator: import('@/types').ProfileRef | null;
  participants: { count: number }[];
  joined_by_me: { user_id: string }[];
};

const SELECT_EVENT = `
  *,
  creator:creator_id (id, username, display_name, avatar_url, role),
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

/** Flat row shape of `public_user_events()` / `public_events_in_bbox()`,
 *  the two RPCs a signed-out visitor reads instead of the `events`
 *  table — which RLS closes to `anon` entirely. */
type PublicEventRow = Omit<
  Event,
  'source_id' | 'archive_warned' | 'coming_poll_created' | 'reminder_sent'
> & {
  creator_username: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  creator_role: string | null;
  participant_count: number;
};

/** Collapse a guest row into the same shape the authenticated path
 *  produces, so every screen downstream is unaware which kind of viewer
 *  it is rendering for.
 *
 *  The four columns the projection withholds are internal bookkeeping;
 *  they are filled with their table defaults rather than left undefined,
 *  because the type says they exist and a guest event that later gets
 *  merged with an authenticated one should not differ in shape. */
function fromPublicRow(row: PublicEventRow): EventWithCreator {
  const {
    creator_username,
    creator_display_name,
    creator_avatar_url,
    creator_role,
    participant_count,
    ...event
  } = row;
  return {
    ...event,
    source_id: null,
    archive_warned: false,
    coming_poll_created: false,
    reminder_sent: false,
    creator: {
      id: event.creator_id,
      username: creator_username ?? 'unknown',
      display_name: creator_display_name ?? 'Unknown',
      avatar_url: creator_avatar_url,
      role: (creator_role ?? 'user') as EventWithCreator['creator']['role'],
    },
    participant_count,
    // A guest has joined nothing, by definition.
    is_joined: false,
  } as EventWithCreator;
}

/** Bounding box of the visible map region. */
export type Bbox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/** The viewer's marker allowance for the current rolling 24 hours.
 *  `max` null means unlimited. `resetsAt` is when the oldest marker in
 *  the window ages out — i.e. the first moment a slot frees up — and is
 *  null when nothing has been pinned yet. */
export type EventQuota = {
  used: number;
  max: number | null;
  resetsAt: string | null;
};

/** The daily cap rejects an INSERT with `DAILY_EVENT_LIMIT <n> <iso>`.
 *  Postgres hands that back as prose in `error.message`, so the two
 *  numbers the UI wants have to be picked back out of the string —
 *  PostgREST has nowhere else to put them.
 *
 *  Returns null for anything that isn't that error, so a caller can fall
 *  through to its normal failure path. */
export function parseDailyLimitError(e: unknown): { limit: number; resetsAt: string } | null {
  const message = e instanceof Error ? e.message : String(e ?? '');
  const m = /DAILY_EVENT_LIMIT (\d+) (\S+)/.exec(message);
  if (!m) return null;
  return { limit: Number(m[1]), resetsAt: m[2]! };
}

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
    // Signed out: `events` is closed to `anon` by RLS, so read the
    // curated projection instead. Same events, minus anything private
    // and minus the columns a stranger has no business seeing.
    if (!viewerId) {
      const { data, error } = await supabase.rpc('public_user_events');
      if (error) throw error;
      return ((data as PublicEventRow[] | null) ?? []).map(fromPublicRow);
    }
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

  /** Which events the viewer has bookmarked. Ids only — the rows come
   *  from `listSaved`, and the map/cards read membership from this set. */
  async listSavedIds(viewerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', viewerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.event_id);
  },

  /** Full rows for the saved list.
   *
   *  Loaded into the store's sticky set alongside joined events, for the
   *  same reason: a bookmarked event has to survive panning the map away
   *  from it, and an imported one would otherwise fall out of the
   *  viewport fetch and vanish from the Saved tab. */
  async listSaved(viewerId: string): Promise<EventWithCreator[]> {
    const ids = await this.listSavedIds(viewerId);
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .in('id', ids);
    if (error) throw error;
    return (data as unknown as RawEventRow[]).map((row) =>
      toEventWithCreator(row, viewerId),
    );
  },

  /** "I'm here." Idempotent — a second tap returns the first timestamp
   *  and posts nothing more, so a double tap can't spam the chat. The
   *  window (2h before to 3h after) is enforced in SQL. */
  async checkIn(eventId: string): Promise<string> {
    const { data, error } = await supabase.rpc('check_in', {
      p_event_id: eventId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  /** When the viewer checked in, or null. */
  async myArrival(eventId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('my_arrival', {
      p_event_id: eventId,
    });
    if (error) return null;
    return (data as string | null) ?? null;
  },

  async save(eventId: string, viewerId: string): Promise<void> {
    const { error } = await supabase
      .from('saved_events')
      .insert({ event_id: eventId, user_id: viewerId });
    // Saving twice is not an error worth surfacing — the button is
    // already showing the state the user wanted.
    if (error && error.code !== '23505') throw error;
  },

  async unsave(eventId: string, viewerId: string): Promise<void> {
    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', viewerId);
    if (error) throw error;
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
    if (!viewerId) {
      const { data, error } = await supabase.rpc('public_events_in_bbox', {
        p_min_lat: bbox.minLat,
        p_max_lat: bbox.maxLat,
        p_min_lng: bbox.minLng,
        p_max_lng: bbox.maxLng,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data as PublicEventRow[] | null) ?? []).map(fromPublicRow);
    }
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

  /** Events `targetId` is attending (joined, not hosted) — but only the
   *  ones their `attending_visibility` setting lets the caller see. The
   *  gate is enforced server-side: the RPC returns the allowed ids, then
   *  we hydrate them (events RLS still filters any private ones). */
  async listAttendingFor(
    targetId: string,
    viewerId: string | null,
  ): Promise<EventWithCreator[]> {
    const { data: ids, error } = await supabase.rpc('list_attending_event_ids', {
      p_target: targetId,
    });
    if (error) throw error;
    const list = (ids as string[] | null) ?? [];
    if (list.length === 0) return [];
    const { data, error: e2 } = await supabase
      .from('events')
      .select(SELECT_EVENT)
      .in('id', list);
    if (e2) throw e2;
    return ((data ?? []) as unknown as RawEventRow[]).map((row) =>
      toEventWithCreator(row, viewerId),
    );
  },

  /** How many markers the viewer may still pin in the current rolling
   *  24 hours. `max` null = unlimited (staff).
   *
   *  Returns null rather than throwing when the call fails: this only
   *  drives a counter and a pre-emptive block, and the DB trigger is the
   *  real cap. An offline device should reach the wizard and be refused
   *  by the server, not be refused by a failed fetch. */
  async myQuota(): Promise<EventQuota | null> {
    const { data, error } = await supabase.rpc('my_event_quota');
    if (error) return null;
    const row = (data as { used: number; max_per_day: number | null; resets_at: string | null }[] | null)?.[0];
    if (!row) return null;
    return { used: row.used, max: row.max_per_day, resetsAt: row.resets_at };
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

  /** Who's going, for the preview's avatar row and the full list behind
   *  it — one call feeds both.
   *
   *  Goes through an RPC rather than selecting `participants` because the
   *  filtering cannot be done here: each attendee's own
   *  `attending_visibility` decides whether they appear, and a client
   *  cannot be trusted with that. See 20260822000000_event_attendees.sql.
   *
   *  The result is therefore sometimes shorter than `participant_count`.
   *  Show the count as the truth and this list as who is willing to be
   *  named. */
  async listEventAttendees(
    eventId: string,
    limit = 50,
  ): Promise<import('@/types').EventAttendee[]> {
    const { data, error } = await supabase.rpc('event_attendees', {
      p_event_id: eventId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      role: row.role as import('@/types').Profile['role'],
      is_friend: row.is_friend,
    }));
  },

  /** Fetch attendee profiles for the preview sheet's avatar row. Limits
   *  to the first N so we don't pay for a giant list on popular events —
   *  the +N overflow chip in the UI covers the rest. */
  async listAttendees(
    eventId: string,
    limit = 8,
  ): Promise<Array<import('@/types').ProfileRef>> {
    const { data, error } = await supabase
      .from('participants')
      .select('profile:profiles!participants_user_id_fkey(id, username, display_name, avatar_url, role)')
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
