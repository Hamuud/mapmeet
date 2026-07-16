-- =========================================================================
-- MapMeet — enforce max_participants at the DB
-- =========================================================================
-- The client was already displaying the cap ("cap 5") but nothing
-- stopped an over-limit join: `eventsService.join` INSERTs a row into
-- `participants` directly. Under a race the count could exceed the
-- creator's stated cap, and clients that skipped the visible "full"
-- state (e.g. an old cached bundle) could always over-join.
--
-- BEFORE INSERT trigger checks the current row count against the
-- event's `max_participants` and raises a check-violation SQLSTATE
-- that the client can catch and surface as a toast.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create or replace function public.enforce_participants_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  cap integer;
  current_count integer;
begin
  -- Cap lives on the event; NULL means unlimited.
  select max_participants
    into cap
  from public.events
  where id = new.event_id;

  if cap is null then
    return new;
  end if;

  -- Count under a lock so concurrent joins can't both slip past the
  -- check. `for update` on events is enough — participants inherits
  -- serialization via the FK.
  perform 1 from public.events where id = new.event_id for update;

  select count(*)::int
    into current_count
  from public.participants
  where event_id = new.event_id;

  if current_count >= cap then
    raise exception 'event % is full (% / %)', new.event_id, current_count, cap
      using errcode = '23514'; -- check_violation, so client can pattern-match
  end if;

  return new;
end;
$$;

drop trigger if exists participants_enforce_cap on public.participants;
create trigger participants_enforce_cap
  before insert on public.participants
  for each row execute function public.enforce_participants_cap();
