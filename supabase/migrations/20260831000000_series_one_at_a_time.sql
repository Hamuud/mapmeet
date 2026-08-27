-- =========================================================================
-- MapMeet — a repeating event is ONE pin, not eight
-- =========================================================================
-- 20260830000000 materialised an 8-week horizon up front. That is the
-- standard calendar model and it is wrong for a map: a weekly book club
-- put eight identical pins on the same building, and "Every week" as a
-- badge said it better than eight copies ever could.
--
-- The model is now a treadmill. Exactly one occurrence is live at a
-- time; when it finishes, the next one appears in its place.
--
-- ARCHIVING NEEDS NO CODE
--   The Chat tab already splits Active / Archive on isEventPast(), and a
--   system message already warns half an hour before the cutoff. So the
--   moment an occurrence passes start + 60 minutes its chat moves to
--   Archive on its own, and the fresh occurrence gets the fresh chat
--   that `chat_on_event_created` gives every event. Nothing here has to
--   arrange that — it falls out of the occurrence being a real event.
--
-- WHAT "FINISHED" MEANS
--   start + EVENT_GRACE_MINUTES (60), the same cutoff the client uses to
--   drop an event off the map and archive its chat. event_date and
--   event_time are naive local values with no zone attached, so the
--   creator's tz_offset_minutes is used to place them on the clock. It
--   is an approximation — it is the offset their device last reported,
--   not the venue's — but it errs late rather than early, and appearing
--   a little after the old one has gone is the harmless direction.
--
-- STOPPING MEANS "NO MORE AFTER THIS ONE"
--   The old version deleted every future occurrence. With one live at a
--   time that would delete the only one, so a host tidying up their
--   repeats would cancel next Wednesday on the people already coming.
--   Stopping now keeps whatever is live and simply stops advancing.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Has this occurrence finished?
-- -------------------------------------------------------------------------
/** True once an event is past its grace window, in the creator's own
 *  timezone as best we know it. Mirrors isEventPast() on the client. */
create or replace function public.event_has_finished(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select ((e.event_date + e.event_time)
            - make_interval(mins => coalesce(p.tz_offset_minutes, 0))
            + interval '60 minutes') <= timezone('utc', now())
    from public.events e
    left join public.profiles p on p.id = e.creator_id
   where e.id = p_event;
$$;

-- -------------------------------------------------------------------------
-- 2. Advance a series by one
-- -------------------------------------------------------------------------
/** If the series' latest occurrence has finished, create the next one
 *  and carry its attendees over. Returns the new event id, or null when
 *  there was nothing to do.
 *
 *  Replaces generate_series_occurrences(), which filled a horizon. */
create or replace function public.advance_series(p_series uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s         public.event_series;
  v_last    public.events;
  v_n       integer := 0;
  v_date    date;
  v_new     uuid;
begin
  select * into s from public.event_series where id = p_series and active;
  if not found then
    return null;
  end if;

  select * into v_last from public.events
   where series_id = p_series
   order by event_date desc, event_time desc
   limit 1;
  if not found then
    return null;   -- set_event_repeat always leaves the anchor behind
  end if;

  -- Still running, or still to come. Nothing to do.
  if not public.event_has_finished(v_last.id) then
    return null;
  end if;

  -- Walk the rule forward past the one that just finished, and past
  -- today: a series left dormant should resume at its next real date
  -- rather than backfilling the weeks nobody was there for.
  loop
    v_n := v_n + 1;
    v_date := public.series_nth_date(s.anchor_date, s.repeat_every, v_n);
    exit when v_n > 400;
    continue when v_date <= v_last.event_date or v_date < current_date;

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
    on conflict (series_id, event_date) where series_id is not null do nothing
    returning id into v_new;

    exit;
  end loop;

  if v_new is null then
    return null;
  end if;

  -- Everyone who was at the one that just finished comes to the next,
  -- host included. via_series keeps this off the push webhook and out
  -- of the chat, which is the difference between a treadmill and eight
  -- notifications every Wednesday night.
  insert into public.participants (event_id, user_id, via_series)
  select v_new, pa.user_id, true
    from public.participants pa
   where pa.event_id = v_last.id
  on conflict do nothing;

  insert into public.participants (event_id, user_id, via_series)
  values (v_new, s.creator_id, true)
  on conflict do nothing;

  return v_new;
end;
$$;

/** Advance every active series. Returns how many rolled over. */
create or replace function public.generate_all_series()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_total integer := 0;
begin
  for r in select id from public.event_series where active loop
    if public.advance_series(r.id) is not null then
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

-- The horizon filler has no callers left, and leaving it around invites
-- somebody to call it and get eight pins back.
drop function if exists public.generate_series_occurrences(uuid, integer);

-- -------------------------------------------------------------------------
-- 3. Turning it on no longer generates anything
-- -------------------------------------------------------------------------
/** The event the host just created IS the first occurrence. The next one
 *  arrives when this one has been and gone. */
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
    return e.series_id;
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
  return v_series;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Stopping keeps what is live
-- -------------------------------------------------------------------------
create or replace function public.stop_event_repeat(p_series uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.event_series
     where id = p_series and creator_id = auth.uid()
  ) then
    raise exception 'not your series' using errcode = '42501';
  end if;

  update public.event_series set active = false, updated_at = now()
   where id = p_series;

  -- Nothing is deleted. Whatever is currently on the map goes ahead as
  -- an ordinary event; it just will not be followed by another.
  update public.events set series_id = null where series_id = p_series;

  return 0;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Collapse the horizons that already exist
-- -------------------------------------------------------------------------
-- Any series created under the old model has up to eight pins out. Keep
-- the soonest one that has not finished — that is the live occurrence —
-- and drop the rest.
--
-- Deliberately keeps past occurrences: they happened, their chats are in
-- somebody's Archive, and deleting them would take the conversation with
-- them.
do $$
declare r record; v_keep uuid;
begin
  for r in select id from public.event_series loop
    select e.id into v_keep
      from public.events e
     where e.series_id = r.id
       and not public.event_has_finished(e.id)
     order by e.event_date asc, e.event_time asc
     limit 1;

    delete from public.events e
     where e.series_id = r.id
       and not public.event_has_finished(e.id)
       and (v_keep is null or e.id <> v_keep);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 6. Check often enough to feel immediate
-- -------------------------------------------------------------------------
-- Daily was right for filling a horizon and wrong for a treadmill: an
-- event finishing at 20:00 would have left the map empty until the small
-- hours. Every 15 minutes matches the reminder sweep, and the work is a
-- single indexed scan of active series.
select cron.unschedule('mapmeet-series-generate')
 where exists (select 1 from cron.job where jobname = 'mapmeet-series-generate');

select cron.schedule(
  'mapmeet-series-generate',
  '*/15 * * * *',
  $job$ select public.generate_all_series(); $job$
);

revoke execute on function public.advance_series(uuid) from public, anon, authenticated;
revoke execute on function public.generate_all_series() from public, anon, authenticated;
grant execute on function public.event_has_finished(uuid) to authenticated;
