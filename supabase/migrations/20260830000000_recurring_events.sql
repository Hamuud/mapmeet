-- =========================================================================
-- MapMeet — repeating events (premium)
-- =========================================================================
-- "Book club, every Wednesday at 19:00." The host pins it once and ticks
-- repeat; the rest appear on their own.
--
-- SHAPE: REAL ROWS, NOT VIRTUAL OCCURRENCES
--   The tempting design is one event carrying a rule, expanded by the
--   client. It cannot work here: chat, participants, saved_events,
--   arrivals, reminders and invites are every one of them keyed on
--   event_id. A virtual occurrence has no id, so it can have no chat and
--   nobody can join it. So a series MATERIALISES ordinary events, and
--   every screen in the app keeps working without knowing they repeat.
--
-- HORIZON: A ROLLING 8 WEEKS
--   Generated forward by a daily job, topped up as time passes — the
--   same pattern as the Karabas ingest. No end date to forget, and the
--   map never carries a year of identical pins.
--
-- THE TEMPLATE IS COPIED, NOT REFERENCED
--   The series takes a snapshot of the first occurrence when repeat is
--   switched on. Pointing at the first event instead would mean editing
--   it silently rewrote every future week, and deleting it would strand
--   the series with nothing to copy.
--
-- ATTENDEES ROLL FORWARD
--   Joining a book club means joining the book club, not this Wednesday.
--   A join propagates to every future occurrence and a leave withdraws
--   from them, so membership behaves like a group even though the rows
--   are separate events.
--
--   Those propagated rows carry `via_series = true`, and both the push
--   webhook and the "X joined" chat message are made to ignore them.
--   Without that, one person joining a book club would send the host
--   eight notifications and write eight system messages.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Who may
-- -------------------------------------------------------------------------
/** Repeating is a paid perk: the premium tier, all staff, or anybody
 *  with an active subscription.
 *
 *  Written out rather than aliased to can_style_pin(), which happens to
 *  have the same rule today. They are two different perks and the next
 *  person to change one should not silently change the other. */
create or replace function public.can_repeat_events(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
      (select p.role = any(public.pin_style_roles()) from public.profiles p where p.id = p_user),
      false)
    or public.has_active_subscription(p_user);
$$;

-- -------------------------------------------------------------------------
-- 2. The series
-- -------------------------------------------------------------------------
create table if not exists public.event_series (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.profiles(id) on delete cascade,

  /** weekly | fortnightly | monthly. Monthly repeats the WEEKDAY
   *  PATTERN — "the second Wednesday" — not the date. A book club that
   *  meets on the 31st would otherwise skip four months a year. */
  repeat_every text not null check (repeat_every in ('weekly','fortnightly','monthly')),

  /** The first occurrence's date. Defines the weekday, and for monthly
   *  the position within the month. */
  anchor_date  date not null,

  -- The template, snapshotted from the first occurrence.
  title        text not null,
  description  text,
  emoji        text not null,
  latitude     double precision not null,
  longitude    double precision not null,
  address      text,
  event_time   time not null,
  max_participants integer,
  visibility   text not null default 'public',
  tags         text[] not null default array['general']::text[],
  pin_color    text,
  pin_effect   text,
  pin_effect_emoji text[],

  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.event_series enable row level security;

drop policy if exists "read own series" on public.event_series;
create policy "read own series" on public.event_series
  for select to authenticated using (creator_id = auth.uid());

-- Writes go through the RPCs below, which check the premium entitlement.
revoke insert, update, delete on public.event_series from anon, authenticated;

alter table public.events
  add column if not exists series_id uuid references public.event_series(id) on delete set null;

-- One occurrence per date per series: what makes generation idempotent.
create unique index if not exists events_series_date_uniq
  on public.events (series_id, event_date) where series_id is not null;

-- Roll-forward rows, so the noisy triggers can skip them.
alter table public.participants
  add column if not exists via_series boolean not null default false;

-- -------------------------------------------------------------------------
-- 3. Silence the per-join fanout for propagated rows
-- -------------------------------------------------------------------------
-- Both of these are AFTER INSERT on participants and both are correct
-- for a real join. Neither is correct eight times over because somebody
-- joined a weekly series once.
drop trigger if exists notify_event_join on public.participants;
create trigger notify_event_join
  after insert on public.participants
  for each row when (new.via_series is not true)
  execute function public.notify_push();

drop trigger if exists chat_participant_joined on public.participants;
create trigger chat_participant_joined
  after insert on public.participants
  for each row when (new.via_series is not true)
  execute function public.chat_on_participant_joined();

-- -------------------------------------------------------------------------
-- 4. The daily cap counts the series, not its occurrences
-- -------------------------------------------------------------------------
/** As 20260824000000, plus one clause: a generated occurrence is exempt.
 *
 *  Switching on repeat is ONE act of hosting and cost one slot when the
 *  first event was pinned. Charging for each occurrence would mean a
 *  weekly series ate a plain user's whole week — and would eventually
 *  refuse to generate at all, leaving a series with holes in it. */
create or replace function public.enforce_daily_event_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit  integer;
  v_used   integer;
  v_oldest timestamptz;
begin
  if coalesce(new.source, 'user') <> 'user' or new.creator_id is null then
    return new;
  end if;

  -- An occurrence of a series the host already paid for.
  if new.series_id is not null then
    return new;
  end if;

  select public.daily_event_limit(p.role) into v_limit
    from public.profiles p where p.id = new.creator_id;
  if not found then
    v_limit := public.daily_event_limit('user');
  end if;

  if v_limit is not null then
    perform pg_advisory_xact_lock(
      hashtext('mapmeet_event_quota'), hashtext(new.creator_id::text));

    select count(*)::int, min(c.created_at)
      into v_used, v_oldest
      from public.event_creations c
     where c.user_id = new.creator_id
       and c.created_at > now() - interval '24 hours';

    if v_used >= v_limit then
      raise exception 'DAILY_EVENT_LIMIT % %',
        v_limit,
        to_char((v_oldest + interval '24 hours') at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        using errcode = '42501';
    end if;
  end if;

  insert into public.event_creations (user_id, event_id)
  values (new.creator_id, new.id)
  on conflict (event_id) do nothing;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Working out the next date
-- -------------------------------------------------------------------------
/** The nth occurrence of a series after its anchor.
 *
 *  weekly / fortnightly are arithmetic. Monthly is not: it lands on the
 *  same weekday in the same position of the month, and clamps when a
 *  month has only four of that weekday and the anchor was the fifth. */
create or replace function public.series_nth_date(
  p_anchor date, p_repeat text, p_n integer
)
returns date language plpgsql immutable as $$
declare
  v_month     date;
  v_ordinal   integer;
  v_dow       integer;
  v_first     date;
  v_candidate date;
begin
  if p_n <= 0 then
    return p_anchor;
  end if;

  if p_repeat = 'weekly' then
    return p_anchor + (p_n * 7);
  elsif p_repeat = 'fortnightly' then
    return p_anchor + (p_n * 14);
  end if;

  -- monthly, by weekday position
  v_ordinal := ((extract(day from p_anchor)::int - 1) / 7) + 1;   -- 1..5
  v_dow     := extract(dow from p_anchor)::int;                    -- 0=Sun
  v_month   := (date_trunc('month', p_anchor) + make_interval(months => p_n))::date;
  v_first   := v_month + ((v_dow - extract(dow from v_month)::int + 7) % 7);
  v_candidate := v_first + ((v_ordinal - 1) * 7);

  -- The 5th Wednesday does not exist every month; fall back to the 4th.
  if extract(month from v_candidate) <> extract(month from v_month) then
    v_candidate := v_candidate - 7;
  end if;
  return v_candidate;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Generating
-- -------------------------------------------------------------------------
/** Materialise every missing occurrence of one series inside the
 *  horizon. Returns how many it created.
 *
 *  SECURITY DEFINER and callable only by the RPCs and the cron job: it
 *  writes events on somebody's behalf, so it must never be reachable
 *  from a client. */
create or replace function public.generate_series_occurrences(
  p_series uuid,
  p_weeks  integer default 8
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s        public.event_series;
  v_until  date := (current_date + (p_weeks * 7))::date;
  v_n      integer := 0;
  v_date   date;
  v_new    uuid;
  v_made   integer := 0;
begin
  select * into s from public.event_series where id = p_series and active;
  if not found then
    return 0;
  end if;

  -- Walk forward from the anchor. Bounded by the horizon, and by a hard
  -- ceiling so a bad rule can never spin.
  loop
    v_n := v_n + 1;
    v_date := public.series_nth_date(s.anchor_date, s.repeat_every, v_n);
    exit when v_date > v_until or v_n > 400;
    continue when v_date < current_date;

    insert into public.events (
      creator_id, title, description, emoji, latitude, longitude, address,
      event_date, event_time, max_participants, visibility, tags,
      pin_color, pin_effect, pin_effect_emoji, series_id
    )
    values (
      s.creator_id, s.title, s.description, s.emoji, s.latitude, s.longitude,
      s.address, v_date, s.event_time, s.max_participants, s.visibility, s.tags,
      s.pin_color, s.pin_effect, s.pin_effect_emoji, s.id
    )
    -- The index is partial (series_id is not null), and ON CONFLICT only
    -- matches a partial index when the statement repeats its predicate.
    on conflict (series_id, event_date) where series_id is not null do nothing
    returning id into v_new;

    if v_new is not null then
      v_made := v_made + 1;
      -- The host attends their own event, and so does everybody who has
      -- joined the series. Copied from the nearest earlier occurrence,
      -- which is the live membership list.
      insert into public.participants (event_id, user_id, via_series)
      select v_new, pa.user_id, true
        from public.participants pa
       where pa.event_id = (
               select e2.id from public.events e2
                where e2.series_id = s.id and e2.event_date < v_date
                order by e2.event_date desc limit 1)
      on conflict do nothing;

      insert into public.participants (event_id, user_id, via_series)
      values (v_new, s.creator_id, true)
      on conflict do nothing;
    end if;
    v_new := null;
  end loop;

  return v_made;
end;
$$;

/** Top every active series up to the horizon. Runs daily. */
create or replace function public.generate_all_series()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_total integer := 0;
begin
  for r in select id from public.event_series where active loop
    v_total := v_total + public.generate_series_occurrences(r.id);
  end loop;
  return v_total;
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Turning it on and off
-- -------------------------------------------------------------------------
/** Make an existing event the first of a series. Premium only, creator
 *  only, and only for an event that is actually theirs and not already
 *  repeating or imported. */
create or replace function public.set_event_repeat(
  p_event  uuid,
  p_repeat text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.events; v_series uuid;
begin
  if not public.can_repeat_events(auth.uid()) then
    raise exception 'REPEAT_REQUIRES_PREMIUM' using errcode = '42501';
  end if;
  if p_repeat not in ('weekly','fortnightly','monthly') then
    raise exception 'unknown repeat interval' using errcode = '22023';
  end if;

  select * into e from public.events where id = p_event;
  if not found then
    raise exception 'no such event' using errcode = '42704';
  end if;
  if e.creator_id <> auth.uid() then
    raise exception 'not your event' using errcode = '42501';
  end if;
  if e.source <> 'user' then
    raise exception 'imported events cannot repeat' using errcode = '42501';
  end if;
  if e.series_id is not null then
    return e.series_id;    -- already repeating; idempotent
  end if;

  insert into public.event_series (
    creator_id, repeat_every, anchor_date,
    title, description, emoji, latitude, longitude, address,
    event_time, max_participants, visibility, tags,
    pin_color, pin_effect, pin_effect_emoji
  )
  values (
    e.creator_id, p_repeat, e.event_date,
    e.title, e.description, e.emoji, e.latitude, e.longitude, e.address,
    e.event_time, e.max_participants, e.visibility, e.tags,
    e.pin_color, e.pin_effect, e.pin_effect_emoji
  )
  returning id into v_series;

  update public.events set series_id = v_series where id = p_event;
  perform public.generate_series_occurrences(v_series);
  return v_series;
end;
$$;

/** Stop a series. Future occurrences are removed; today's and past ones
 *  stay, because they already happened or are about to.
 *
 *  Deleting the future ones is the point: "stop repeating" that left
 *  eight pins on the map would not have stopped anything. Anyone who had
 *  joined gets the ordinary cancellation push, which is exactly right —
 *  it is cancelled. */
create or replace function public.stop_event_repeat(p_series uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_removed integer;
begin
  if not exists (
    select 1 from public.event_series
     where id = p_series and creator_id = auth.uid()
  ) then
    raise exception 'not your series' using errcode = '42501';
  end if;

  update public.event_series set active = false, updated_at = now()
   where id = p_series;

  -- Future occurrences go, EXCEPT the anchor: that one is the event the
  -- host hand-created before ticking repeat, and "stop repeating" must
  -- not delete it out from under them.
  delete from public.events e
   where e.series_id = p_series
     and e.event_date > current_date
     and e.event_date <> (select anchor_date from public.event_series where id = p_series);
  get diagnostics v_removed = row_count;

  -- Unlink whatever survives. After this nothing points at a dead
  -- series, which is what lets the client treat "series_id is not null"
  -- as "this repeats" without also having to check `active`.
  update public.events set series_id = null where series_id = p_series;

  return v_removed;
end;
$$;

-- -------------------------------------------------------------------------
-- 8. Membership follows the series
-- -------------------------------------------------------------------------
/** Join one occurrence, join the rest. Leave one, leave the rest.
 *
 *  Symmetric on purpose. "I am coming to the book club" and "I am not
 *  coming any more" are the two things people mean; per-week opt-outs
 *  would need a control nothing in the UI has, and silently joining
 *  somebody to eight weeks they cannot leave in one action is worse. */
create or replace function public.series_join_forward()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_series uuid; v_date date;
begin
  if new.via_series then
    return new;      -- propagated row; do not recurse
  end if;
  select series_id, event_date into v_series, v_date
    from public.events where id = new.event_id;
  if v_series is null then
    return new;
  end if;

  insert into public.participants (event_id, user_id, via_series)
  select e.id, new.user_id, true
    from public.events e
   where e.series_id = v_series and e.event_date > v_date
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.series_leave_forward()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_series uuid; v_date date;
begin
  select series_id, event_date into v_series, v_date
    from public.events where id = old.event_id;
  if v_series is null then
    return old;
  end if;

  delete from public.participants pa
   using public.events e
   where pa.event_id = e.id
     and e.series_id = v_series
     and e.event_date > v_date
     and pa.user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists participants_series_join on public.participants;
create trigger participants_series_join
  after insert on public.participants
  for each row execute function public.series_join_forward();

drop trigger if exists participants_series_leave on public.participants;
create trigger participants_series_leave
  after delete on public.participants
  for each row execute function public.series_leave_forward();

-- -------------------------------------------------------------------------
-- 9. Grants
-- -------------------------------------------------------------------------
grant execute on function public.can_repeat_events(uuid)          to authenticated;
grant execute on function public.set_event_repeat(uuid, text)     to authenticated;
grant execute on function public.stop_event_repeat(uuid)          to authenticated;
-- Generation is for the cron job and the RPCs above only.
revoke execute on function public.generate_series_occurrences(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.generate_all_series() from public, anon, authenticated;
