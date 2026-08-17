-- MapMeet — "I'm here."
--
-- Part of making it comfortable to go and meet six strangers somewhere.
-- Two people benefit: whoever is already standing outside the café
-- wondering if anyone else is coming, and whoever the attendee told they
-- were going out.
--
-- The window is deliberately generous — two hours before through three
-- after. People arrive early, events run long, and refusing a check-in
-- because someone is keen is a strange thing for an app to do.

alter table public.participants
  add column if not exists arrived_at timestamptz;

/** Mark the caller as arrived at an event they joined.
 *
 *  Idempotent: tapping twice keeps the first timestamp and posts nothing
 *  more, so a double tap can't spam the chat. Announces once in the event
 *  chat, because "Оксана arrived" is exactly what the other people
 *  looking around a café want to read. */
create or replace function public.check_in(p_event_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start timestamptz;
  v_existing timestamptz;
  v_name text;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.arrived_at into v_existing
    from public.participants p
   where p.event_id = p_event_id and p.user_id = v_me;

  if not found then
    raise exception 'Join the event before checking in.' using errcode = '42501';
  end if;
  -- Already here. Return the original time rather than moving it: the
  -- first arrival is the interesting one.
  if v_existing is not null then
    return v_existing;
  end if;

  select (e.event_date::timestamp + e.event_time::time)
           at time zone public.app_timezone()
    into v_start
    from public.events e where e.id = p_event_id;

  if v_start is null then
    raise exception 'Event not found.' using errcode = '22023';
  end if;
  if now() < v_start - interval '2 hours' then
    raise exception 'You can check in once the event is close.'
      using errcode = '22023';
  end if;
  if now() > v_start + interval '3 hours' then
    raise exception 'This event has finished.' using errcode = '22023';
  end if;

  update public.participants
     set arrived_at = now()
   where event_id = p_event_id and user_id = v_me;

  select display_name into v_name from public.profiles where id = v_me;
  insert into public.messages (event_id, sender_id, type, text)
  values (p_event_id, v_me, 'system',
          coalesce(v_name, 'Someone') || ' arrived');

  return now();
end;
$$;

/** Has the caller checked in? Null if not, or if they aren't going. */
create or replace function public.my_arrival(p_event_id uuid)
returns timestamptz
language sql security definer stable set search_path = public as $$
  select arrived_at from public.participants
   where event_id = p_event_id and user_id = auth.uid();
$$;

revoke all on function public.check_in(uuid) from anon;
revoke all on function public.my_arrival(uuid) from anon;

comment on column public.participants.arrived_at is
  'Set by check_in(); null until the attendee says they are there.';
