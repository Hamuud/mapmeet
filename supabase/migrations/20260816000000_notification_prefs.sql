-- =========================================================================
-- MapMeet — notification preferences, area digest and event reminders
-- =========================================================================
-- Everything the push layer needs to know about a person lived only in
-- AsyncStorage: the master toggle, the search radius, the language. A
-- cron job on the server cannot read any of that, so this migration
-- gives the server its own copy, written through one RPC.
--
--   locale, tz_offset_minutes  — so a push is in the recipient's
--                                language and never lands at 04:00
--   push_chat / joins /
--   events / social / digest   — per-category switches
--   digest_lat/lng/radius_km   — the area the digest counts events in
--   digest_last_sent_at        — dedupe + the "since" bound of the count
--   events.reminder_sent       — one-shot flag for the 1-hour reminder
--
-- The write path is `sync_push_settings`, not a table grant. Same reason
-- as 20260815000000: a client that can UPDATE profiles freely can edit
-- columns it has no business touching.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists locale               text    not null default 'en',
  add column if not exists tz_offset_minutes    integer not null default 0,
  add column if not exists push_chat            boolean not null default true,
  add column if not exists push_joins           boolean not null default true,
  add column if not exists push_events          boolean not null default true,
  add column if not exists push_social          boolean not null default true,
  add column if not exists push_digest          boolean not null default true,
  add column if not exists digest_lat           double precision,
  add column if not exists digest_lng           double precision,
  add column if not exists digest_radius_km     integer not null default 5,
  add column if not exists digest_last_sent_at  timestamptz;

do $$ begin
  alter table public.profiles drop constraint if exists profiles_locale_check;
  alter table public.profiles add constraint profiles_locale_check
    check (locale in ('en','uk'));
  alter table public.profiles drop constraint if exists profiles_digest_radius_check;
  alter table public.profiles add constraint profiles_digest_radius_check
    check (digest_radius_km between 1 and 100);
  alter table public.profiles drop constraint if exists profiles_tz_offset_check;
  alter table public.profiles add constraint profiles_tz_offset_check
    check (tz_offset_minutes between -840 and 840);
end $$;

alter table public.events
  add column if not exists reminder_sent boolean not null default false;

-- Partial index: the reminder sweep only ever looks at events that have
-- not fired yet, and that set stays small.
create index if not exists events_reminder_pending_idx
  on public.events (event_date, event_time) where reminder_sent = false;

-- -------------------------------------------------------------------------
-- Client write path
-- -------------------------------------------------------------------------
/** The one way a client updates its own notification settings.
 *
 *  Every argument is optional so the caller can send a single toggle
 *  without having to know the rest. The digest anchor is the user's
 *  last known position, refreshed whenever the app has location — it is
 *  what "in your area" means when they are not holding the phone. */
create or replace function public.sync_push_settings(
  p_locale     text    default null,
  p_tz_offset  integer default null,
  p_chat       boolean default null,
  p_joins      boolean default null,
  p_events     boolean default null,
  p_social     boolean default null,
  p_digest     boolean default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_radius_km  integer default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.profiles set
    locale            = coalesce(nullif(p_locale, ''), locale),
    tz_offset_minutes = coalesce(p_tz_offset, tz_offset_minutes),
    push_chat         = coalesce(p_chat,   push_chat),
    push_joins        = coalesce(p_joins,  push_joins),
    push_events       = coalesce(p_events, push_events),
    push_social       = coalesce(p_social, push_social),
    push_digest       = coalesce(p_digest, push_digest),
    -- Latitude and longitude move together or not at all; a half-updated
    -- anchor would put the digest somewhere nobody has ever been.
    digest_lat        = case when p_lat is not null and p_lng is not null then p_lat else digest_lat end,
    digest_lng        = case when p_lat is not null and p_lng is not null then p_lng else digest_lng end,
    digest_radius_km  = coalesce(p_radius_km, digest_radius_km)
  where id = auth.uid();
end;
$$;

-- -------------------------------------------------------------------------
-- Area digest
-- -------------------------------------------------------------------------
-- Wall-clock date+time with no zone is what the app stores, so the
-- server has to pick one to compare against. Ukraine is where the users
-- and every imported event are; change this constant if that stops
-- being true.
create or replace function public.app_timezone()
returns text language sql immutable as $$ select 'Europe/Kyiv'::text $$;

/** Who should get an area digest right now, and how many events it is
 *  about.
 *
 *  Deliberately conservative — a notification that says "3 new events"
 *  every single day trains people to swipe it away. A row comes back
 *  only when all of these hold:
 *
 *    · they have a token and have not turned digests off
 *    · we know where "their area" is
 *    · they have not opened the app for a day (last_seen_at)
 *    · we have not sent them one for a day
 *    · it is daytime where they are
 *    · and there are at least `p_min_events` genuinely new ones
 *
 *  "New" means created since their last digest, so nothing is ever
 *  counted twice; the first digest looks back a week. City-precision
 *  imports are excluded because they are hidden from the map — counting
 *  events the user then cannot find would be a lie. */
create or replace function public.digest_audience(p_min_events integer default 5)
returns table (user_id uuid, push_token text, locale text, new_events integer)
language sql stable security definer set search_path = public as $$
  with candidate as (
    select p.id, p.push_token, p.locale, p.digest_lat, p.digest_lng,
           p.digest_radius_km,
           coalesce(p.digest_last_sent_at, now() - interval '7 days') as since
      from public.profiles p
     where p.push_token like 'ExponentPushToken%'
       and p.push_digest
       and p.digest_lat is not null
       and p.digest_lng is not null
       and p.banned_at is null
       and (p.last_seen_at is null or p.last_seen_at < now() - interval '20 hours')
       and (p.digest_last_sent_at is null or p.digest_last_sent_at < now() - interval '20 hours')
       -- 10:00–21:00 in their own offset. tz_offset_minutes is what the
       -- device reported, so this is their wall clock, not Kyiv's.
       and extract(hour from (now() + make_interval(mins => p.tz_offset_minutes))) between 10 and 20
  )
  select c.id, c.push_token, c.locale, count(e.id)::integer
    from candidate c
    join public.events e
      on e.visibility = 'public'
     and e.creator_id <> c.id
     and e.created_at > c.since
     and coalesce(e.geo_precision, 'venue') <> 'city'
     and (e.event_date + e.event_time) at time zone public.app_timezone() > now()
     -- Bounding box first so events_lat_lng_idx does the heavy lifting;
     -- the haversine below only refines what the box already narrowed.
     and e.latitude  between c.digest_lat - (c.digest_radius_km / 111.0)
                         and c.digest_lat + (c.digest_radius_km / 111.0)
     and e.longitude between c.digest_lng - (c.digest_radius_km / (111.0 * cos(radians(c.digest_lat))))
                         and c.digest_lng + (c.digest_radius_km / (111.0 * cos(radians(c.digest_lat))))
     and 6371 * 2 * asin(sqrt(
           power(sin(radians(e.latitude - c.digest_lat) / 2), 2) +
           cos(radians(c.digest_lat)) * cos(radians(e.latitude)) *
           power(sin(radians(e.longitude - c.digest_lng) / 2), 2)
         )) <= c.digest_radius_km
   group by c.id, c.push_token, c.locale
  having count(e.id) >= p_min_events;
$$;

/** Called by the digest function once Expo has accepted the batch. */
create or replace function public.mark_digest_sent(p_users uuid[])
returns void language sql security definer set search_path = public as $$
  update public.profiles set digest_last_sent_at = now()
   where id = any(p_users);
$$;

-- -------------------------------------------------------------------------
-- "Starts in an hour"
-- -------------------------------------------------------------------------
/** Events starting inside the next `p_window_minutes`, one row per
 *  attendee who wants event notifications and has a token.
 *
 *  The creator is included: they asked for it by pinning it, and a host
 *  who forgets is worse off than a guest who does. */
create or replace function public.due_event_reminders(p_window_minutes integer default 75)
returns table (
  event_id uuid, title text, emoji text, starts_at timestamptz,
  user_id uuid, push_token text, locale text
)
language sql stable security definer set search_path = public as $$
  with due as (
    select e.id, e.title, e.emoji,
           (e.event_date + e.event_time) at time zone public.app_timezone() as starts_at
      from public.events e
     where e.reminder_sent = false
       and e.source = 'user'
       and (e.event_date + e.event_time) at time zone public.app_timezone()
             between now() and now() + make_interval(mins => p_window_minutes)
  )
  select d.id, d.title, d.emoji, d.starts_at, p.id, p.push_token, p.locale
    from due d
    join public.participants pa on pa.event_id = d.id
    join public.profiles p on p.id = pa.user_id
   where p.push_token like 'ExponentPushToken%'
     and p.push_events
     and p.banned_at is null;
$$;

create or replace function public.mark_reminders_sent(p_events uuid[])
returns void language sql security definer set search_path = public as $$
  update public.events set reminder_sent = true where id = any(p_events);
$$;

grant execute on function public.sync_push_settings(
  text, integer, boolean, boolean, boolean, boolean, boolean,
  double precision, double precision, integer) to authenticated;

-- The digest helpers are for the cron-invoked Edge Function only; it
-- authenticates with the service key.
revoke execute on function public.digest_audience(integer)        from authenticated, anon;
revoke execute on function public.mark_digest_sent(uuid[])        from authenticated, anon;
revoke execute on function public.due_event_reminders(integer)    from authenticated, anon;
revoke execute on function public.mark_reminders_sent(uuid[])     from authenticated, anon;
