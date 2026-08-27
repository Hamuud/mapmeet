-- =========================================================================
-- MapMeet — what a signed-out visitor may see
-- =========================================================================
-- Guests get the map: public events, their pins, and enough of each one
-- to decide whether it is worth making an account for. Joining, chat,
-- attendee lists and anything private stay behind the wall.
--
-- WHY RPCs AND NOT AN RLS POLICY FOR `anon`
--   The obvious version is "add a select policy on events to anon". It
--   is the wrong tool twice over:
--
--   1. The event card needs a participant COUNT, and the only way to get
--      one through PostgREST is an embed — which needs SELECT on
--      `participants`, whose rows are (event_id, user_id) pairs. That is
--      precisely the "who is going where" data that
--      attending_visibility exists to protect. A count is safe; the
--      rows it is computed from are not.
--   2. A policy grants whole rows. These functions grant a projection,
--      so the internal columns (source_id, reminder_sent,
--      archive_warned, coming_poll_created) never leave the database,
--      and adding a column to `events` later cannot silently widen what
--      an anonymous caller sees.
--
--   The cost is two functions to keep in step with the client's two
--   fetches. That is a fair trade for a surface that faces the open
--   internet with a key published in the web bundle.
--
-- MIRRORS THE AUTHENTICATED SHAPE ON PURPOSE
--   `public_user_events()` matches eventsService.list() and
--   `public_events_in_bbox()` matches listExternalInBbox(), so the guest
--   path is the same two calls with the same semantics and the client
--   can swap one for the other rather than growing a second data model.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- THE PROJECTION, in both functions below. Every column in it is already
-- visible on a pin or an event card to anyone who can see the event.
--
-- Absent, deliberately:
--   source_id, reminder_sent, archive_warned, coming_poll_created
--       — internal bookkeeping
--   the participant rows themselves
--       — only the count crosses the line

/** Public events pinned by people. The guest twin of eventsService.list().
 *
 *  No date filter, matching the authenticated path — the client decides
 *  what counts as past, and it must agree for both kinds of viewer or a
 *  guest and a member would see different pins on the same map. */
create or replace function public.public_user_events()
returns table (
  id uuid, creator_id uuid, title text, description text, emoji text,
  latitude double precision, longitude double precision, address text,
  event_date date, event_time time, max_participants integer,
  visibility text, tags text[],
  source text, source_url text, image_url text, geo_precision text,
  pin_color text, pin_effect text, pin_effect_emoji text[],
  created_at timestamptz, updated_at timestamptz,
  creator_username text, creator_display_name text,
  creator_avatar_url text, creator_role text,
  participant_count integer
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.creator_id, e.title, e.description, e.emoji,
    e.latitude, e.longitude, e.address,
    e.event_date, e.event_time, e.max_participants, e.visibility, e.tags,
    e.source, e.source_url, e.image_url, e.geo_precision,
    e.pin_color, e.pin_effect, e.pin_effect_emoji,
    e.created_at, e.updated_at,
    p.username, p.display_name, p.avatar_url, p.role,
    (select count(*)::int from public.participants pa where pa.event_id = e.id)
  from public.events e
  left join public.profiles p on p.id = e.creator_id
  where e.source = 'user'
    and e.visibility = 'public'
  order by e.event_date asc;
$$;

/** Imported events in the visible box. The guest twin of
 *  listExternalInBbox(). Same 300-row cap for the same reason: zoomed
 *  out over a country the box covers hundreds, and a dense sample shown
 *  fast beats a complete one that stalls the map. */
create or replace function public.public_events_in_bbox(
  p_min_lat double precision,
  p_max_lat double precision,
  p_min_lng double precision,
  p_max_lng double precision,
  p_limit   integer default 300
)
returns table (
  id uuid, creator_id uuid, title text, description text, emoji text,
  latitude double precision, longitude double precision, address text,
  event_date date, event_time time, max_participants integer,
  visibility text, tags text[],
  source text, source_url text, image_url text, geo_precision text,
  pin_color text, pin_effect text, pin_effect_emoji text[],
  created_at timestamptz, updated_at timestamptz,
  creator_username text, creator_display_name text,
  creator_avatar_url text, creator_role text,
  participant_count integer
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.creator_id, e.title, e.description, e.emoji,
    e.latitude, e.longitude, e.address,
    e.event_date, e.event_time, e.max_participants, e.visibility, e.tags,
    e.source, e.source_url, e.image_url, e.geo_precision,
    e.pin_color, e.pin_effect, e.pin_effect_emoji,
    e.created_at, e.updated_at,
    p.username, p.display_name, p.avatar_url, p.role,
    (select count(*)::int from public.participants pa where pa.event_id = e.id)
  from public.events e
  left join public.profiles p on p.id = e.creator_id
  where e.source <> 'user'
    and e.visibility = 'public'
    and e.event_date >= current_date - 1
    and e.latitude between p_min_lat and p_max_lat
    and e.longitude between p_min_lng and p_max_lng
  order by e.event_date asc
  limit least(coalesce(p_limit, 300), 300);
$$;

-- anon is the point of the exercise; authenticated is granted too so a
-- guest who signs in mid-session does not fail a call that was already
-- in flight.
grant execute on function public.public_user_events()                      to anon, authenticated;
grant execute on function public.public_events_in_bbox(
  double precision, double precision, double precision, double precision, integer
) to anon, authenticated;
