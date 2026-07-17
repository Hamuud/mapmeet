-- =========================================================================
-- MapMeet — imported events from ticketing sites (karabas.com first)
-- =========================================================================
-- GOAL
--   Pull public events (concerts / festivals / theatre) from partner
--   sites once a week and drop them on the map like any other event, so
--   people can find something to do and go together.
--
-- DESIGN — why imported events live in `events` and not a side table
--   An imported event needs everything a user event has: a marker, a
--   peek, a Join button, and its own group chat. `messages` is keyed on
--   `event_id`, the map reads `events`, "Nearby" reads `events`. A
--   parallel table would need all of that duplicated. So: same table,
--   tagged with `source`.
--
--   `source = 'user'`  → someone pinned it in the app (the default;
--                         every existing row backfills to this)
--   `source = 'karabas'` (etc.) → imported, owned by that source's bot
--                         profile, upserted by (source, source_id).
--
-- EXTENSIBILITY — adding a country/site later is two steps
--   1. insert into public.event_sources (+ ensure_source_bot)
--   2. add a matching module under supabase/functions/ingest-events/sources/
--   Nothing else changes: the RPC, cron, client and UI are source-agnostic.
--
-- GEO PRECISION — the "no marker, but still in Nearby" rule
--   Imported venues are geocoded from their street address. When that
--   fails we fall back to the city centroid:
--     'venue' → exact address resolved   → marker on the map
--     'city'  → only the city resolved   → NO marker; still listed in
--               Nearby with the venue text exactly as the source wrote it
--   (If not even the city resolves, the event is skipped — with no
--   coordinates at all it can't answer "is this near me?".)
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1. Columns on events -----------------------------------------------------

alter table public.events
  add column if not exists source        text not null default 'user',
  add column if not exists source_id     text,
  add column if not exists source_url    text,
  add column if not exists image_url     text,
  add column if not exists geo_precision text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_geo_precision_check'
  ) then
    alter table public.events add constraint events_geo_precision_check
      check (geo_precision is null or geo_precision in ('venue', 'city'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'events_source_id_required_check'
  ) then
    -- Imported rows must carry the id we upsert on; user rows must not.
    alter table public.events add constraint events_source_id_required_check
      check ((source = 'user' and source_id is null)
             or (source <> 'user' and source_id is not null));
  end if;
end$$;

-- The upsert key for re-runs: one row per (site, external id).
create unique index if not exists events_source_unique_idx
  on public.events (source, source_id)
  where source <> 'user';

-- Map/Nearby read paths filter on these.
create index if not exists events_source_idx on public.events (source);
create index if not exists events_source_date_idx
  on public.events (source, event_date)
  where source <> 'user';

-- 2. Source registry -------------------------------------------------------

create table if not exists public.event_sources (
  id            text primary key,                       -- 'karabas'
  display_name  text not null,                          -- 'Karabas'
  country       text not null,                          -- ISO-3166-1 alpha-2
  website       text not null,
  bot_profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  last_run_count integer,
  created_at    timestamptz not null default timezone('utc', now())
);

alter table public.event_sources enable row level security;

-- Readable by the app (the peek shows "imported from Karabas"); writes
-- are service-role only (no INSERT/UPDATE policy).
drop policy if exists "event sources are readable" on public.event_sources;
create policy "event sources are readable"
  on public.event_sources for select
  to authenticated
  using (true);

-- 3. Source bot profiles ---------------------------------------------------
--   Imported events need an owner: events.creator_id is NOT NULL and the
--   whole UI reads `event.creator.display_name`. Rather than make the
--   column nullable (and re-check every join, policy and screen), each
--   source gets one bot profile that hosts its events.
--
--   profiles.id references auth.users, so the bot needs an auth row. It
--   is created with no password and no confirmed email — it cannot sign
--   in, it only exists to own rows. The id is derived deterministically
--   from the source id, so re-running is a no-op.

create or replace function public.ensure_source_bot(
  p_source_id   text,
  p_display_name text,
  p_username    text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  -- v5 = deterministic from the source id: same input, same uuid, so
  -- this function is idempotent without storing state.
  v_id uuid := uuid_generate_v5(uuid_ns_url(), 'mapmeet:source:' || p_source_id);
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'bot+' || p_source_id || '@mapmeet.invalid',
    null, null,
    jsonb_build_object('provider', 'system', 'providers', array['system']),
    jsonb_build_object('username', p_username, 'display_name', p_display_name),
    timezone('utc', now()), timezone('utc', now())
  )
  on conflict (id) do nothing;

  -- handle_new_user() fires on the insert above and creates the profile.
  -- On a re-run (or if that trigger is ever removed) make sure it exists.
  insert into public.profiles (id, username, display_name)
  values (v_id, p_username, p_display_name)
  on conflict (id) do nothing;

  return v_id;
end;
$$;

-- Functions are EXECUTE-to-PUBLIC by default. Lock these to the ingest
-- job: revoking from PUBLIC also strips service_role's implicit grant,
-- so it has to be granted back explicitly or the Edge Function 403s.
revoke execute on function public.ensure_source_bot(text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_source_bot(text, text, text) to service_role;

-- Register karabas.com. Adding another country later is exactly this
-- block plus a source module in the Edge Function.
do $$
declare
  v_bot uuid;
begin
  v_bot := public.ensure_source_bot('karabas', 'Karabas', 'karabas');
  insert into public.event_sources (id, display_name, country, website, bot_profile_id)
  values ('karabas', 'Karabas', 'UA', 'https://karabas.com', v_bot)
  on conflict (id) do update
    set display_name = excluded.display_name,
        website      = excluded.website,
        bot_profile_id = excluded.bot_profile_id;
end$$;

-- 4. Geocode cache ---------------------------------------------------------
--   Nominatim allows ~1 request/second, and venues repeat heavily across
--   events (one concert hall hosts dozens). Caching by query string turns
--   a few hundred lookups per run into a few dozen.
--   `precision` mirrors events.geo_precision, plus 'none' to remember a
--   negative result so we don't re-ask every week.

create table if not exists public.geocode_cache (
  query      text primary key,
  latitude   double precision,
  longitude  double precision,
  precision  text not null check (precision in ('venue', 'city', 'none')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.geocode_cache enable row level security;
-- No policies: service-role (the Edge Function) only.

-- 5. Ingest RPC ------------------------------------------------------------
--   One call per scraped event. Upserts by (source, source_id) and, on
--   first insert only, posts the event's details into its chat — the
--   ticket link, venue, title and description, so anyone who joins sees
--   everything without leaving the app.

create or replace function public.ingest_external_event(
  p_source        text,
  p_source_id     text,
  p_title         text,
  p_description   text,
  p_emoji         text,
  p_latitude      double precision,
  p_longitude     double precision,
  p_address       text,
  p_event_date    date,
  p_event_time    time,
  p_tags          text[],
  p_source_url    text,
  p_image_url     text,
  p_geo_precision text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot     uuid;
  v_id      uuid;
  v_existed boolean;
  v_body    text;
  v_desc    text;
begin
  select bot_profile_id into v_bot
    from public.event_sources where id = p_source and enabled;
  if v_bot is null then
    raise exception 'unknown or disabled event source: %', p_source;
  end if;

  select id into v_id
    from public.events
   where source = p_source and source_id = p_source_id;
  v_existed := v_id is not null;

  if v_existed then
    update public.events
       set title = left(p_title, 80),
           description = left(p_description, 500),
           emoji = p_emoji,
           latitude = p_latitude,
           longitude = p_longitude,
           address = left(p_address, 200),
           event_date = p_event_date,
           event_time = p_event_time,
           tags = p_tags,
           source_url = p_source_url,
           image_url = p_image_url,
           geo_precision = p_geo_precision
     where id = v_id;
  else
    insert into public.events (
      creator_id, title, description, emoji, latitude, longitude, address,
      event_date, event_time, visibility, tags,
      source, source_id, source_url, image_url, geo_precision
    )
    values (
      v_bot, left(p_title, 80), left(p_description, 500), p_emoji,
      p_latitude, p_longitude, left(p_address, 200),
      p_event_date, p_event_time, 'public', p_tags,
      p_source, p_source_id, p_source_url, p_image_url, p_geo_precision
    )
    returning id into v_id;

    -- Everything about the event, in the chat, from the start.
    -- (Poster image lands here too once media messages are wired up —
    --  events.image_url already carries the URL.)
    v_desc := coalesce(nullif(btrim(p_description), ''), '');
    if char_length(v_desc) > 900 then
      v_desc := left(v_desc, 900) || '…';
    end if;

    v_body := p_emoji || ' ' || p_title
      || case when p_address is not null and btrim(p_address) <> ''
              then E'\n📍 ' || p_address else '' end
      || E'\n🗓 ' || to_char(p_event_date, 'DD.MM.YYYY') || ' · ' || to_char(p_event_time, 'HH24:MI')
      || case when v_desc <> '' then E'\n\n' || v_desc else '' end
      || case when p_source_url is not null and btrim(p_source_url) <> ''
              then E'\n\n🎟 ' || p_source_url else '' end;

    insert into public.messages (event_id, sender_id, type, text)
    values (v_id, null, 'system', left(v_body, 2000));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.ingest_external_event(
  text, text, text, text, text, double precision, double precision, text,
  date, time, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.ingest_external_event(
  text, text, text, text, text, double precision, double precision, text,
  date, time, text[], text, text, text
) to service_role;

-- 6. Quieter system message for imported events ----------------------------
--   The "<host> created this event" line reads as noise on an imported
--   event — ingest_external_event posts the real details instead.

create or replace function public.chat_on_event_created()
returns trigger
language plpgsql
security definer
as $$
declare
  v_name text;
begin
  if new.source is distinct from 'user' then
    return new;
  end if;
  select display_name into v_name from public.profiles where id = new.creator_id;
  insert into public.messages (event_id, sender_id, type, text)
  values (new.id, new.creator_id, 'system',
          coalesce(v_name, 'Someone') || ' created this event');
  return new;
end;
$$;

-- 7. Weekly cleanup --------------------------------------------------------
--   Imported events nobody engaged with are disposable: once they're
--   past, drop them so the table doesn't grow forever. Anything a real
--   user joined is kept — their chat history and Archive stay intact.

create or replace function public.purge_past_external_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with dead as (
    delete from public.events e
     where e.source <> 'user'
       and (e.event_date + e.event_time) < (timezone('utc', now()) - interval '1 day')
       and not exists (
         select 1 from public.participants p where p.event_id = e.id
       )
    returning 1
  )
  select count(*) into v_count from dead;
  return v_count;
end;
$$;

revoke execute on function public.purge_past_external_events() from public, anon, authenticated;
grant execute on function public.purge_past_external_events() to service_role;
