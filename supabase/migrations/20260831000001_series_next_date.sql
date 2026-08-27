-- =========================================================================
-- MapMeet — show when the next one lands
-- =========================================================================
-- With one occurrence live at a time, "when is the next book club?" is
-- unanswerable from the map until this week's has passed. The badge says
-- "Every week", which gives the pattern but not the date.
--
-- WHY THIS IS NOT COMPUTED ON THE CLIENT
--   Weekly and fortnightly are just +7 and +14, and it is tempting to do
--   the arithmetic in the app. Monthly breaks it. The rule is the nth
--   weekday of the month measured FROM THE ANCHOR, and it clamps: a
--   series anchored on the 5th Wednesday of September lands on the 4th
--   Wednesday of October, because October has only four. Walk forward
--   from THAT occurrence instead of the anchor and you get the 4th
--   Wednesday of December where the series actually meets on the 5th.
--   The anchor is authoritative, and the anchor lives on event_series,
--   which only its creator may read.
--
--   So the date is computed server-side and denormalised onto the
--   occurrence, next to repeat_every and for the same reason.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.events
  add column if not exists next_date date;

/** The series' first date strictly after `p_after`. Null when the rule
 *  runs out (it does not, in practice — the ceiling is a guard). */
create or replace function public.series_next_date_after(
  p_anchor date, p_repeat text, p_after date
)
returns date language plpgsql immutable as $$
declare v_n integer := 0; v_date date;
begin
  loop
    v_n := v_n + 1;
    if v_n > 400 then
      return null;
    end if;
    v_date := public.series_nth_date(p_anchor, p_repeat, v_n);
    if v_date > p_after then
      return v_date;
    end if;
  end loop;
end;
$$;

/** Keep both denormalised columns true, in both directions. Extended
 *  from 20260830000001 to carry the next date as well — one trigger, so
 *  the two can never disagree. */
create or replace function public.sync_event_repeat_every()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.event_series;
begin
  if new.series_id is null then
    new.repeat_every := null;
    new.next_date    := null;
    return new;
  end if;

  select * into s from public.event_series where id = new.series_id;
  if not found then
    new.repeat_every := null;
    new.next_date    := null;
    return new;
  end if;

  new.repeat_every := s.repeat_every;
  -- Null once the series is stopped: there is no next one, and showing
  -- a date for a series that will not advance is a lie.
  new.next_date := case
    when s.active then public.series_next_date_after(s.anchor_date, s.repeat_every, new.event_date)
    else null
  end;
  return new;
end;
$$;

-- Backfill.
update public.events e
   set next_date = case
         when s.active then public.series_next_date_after(s.anchor_date, s.repeat_every, e.event_date)
         else null
       end
  from public.event_series s
 where e.series_id = s.id
   and e.next_date is distinct from (case
         when s.active then public.series_next_date_after(s.anchor_date, s.repeat_every, e.event_date)
         else null
       end);

-- ---------------------------------------------------------------------
-- The guest projection learns about repeats
-- ---------------------------------------------------------------------
-- Both of these gain two columns, which means dropping and recreating:
-- a function's OUT list cannot be widened in place. Closes the gap noted
-- when repeating shipped — a signed-out visitor could not see that an
-- event repeats, which is exactly the sort of thing that makes an
-- account look worth having.
drop function if exists public.public_user_events();
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
  participant_count integer,
  repeat_every text, next_date date
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
    (select count(*)::int from public.participants pa where pa.event_id = e.id),
    e.repeat_every, e.next_date
  from public.events e
  left join public.profiles p on p.id = e.creator_id
  where e.source = 'user'
    and e.visibility = 'public'
  order by e.event_date asc;
$$;

drop function if exists public.public_events_in_bbox(
  double precision, double precision, double precision, double precision, integer);
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
  participant_count integer,
  repeat_every text, next_date date
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
    (select count(*)::int from public.participants pa where pa.event_id = e.id),
    e.repeat_every, e.next_date
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

grant execute on function public.public_user_events()                      to anon, authenticated;
grant execute on function public.public_events_in_bbox(
  double precision, double precision, double precision, double precision, integer
) to anon, authenticated;
grant execute on function public.series_next_date_after(date, text, date)  to authenticated;
