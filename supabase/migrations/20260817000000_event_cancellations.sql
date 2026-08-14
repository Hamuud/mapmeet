-- =========================================================================
-- MapMeet — capture who to tell when an event is deleted
-- =========================================================================
-- The obvious wiring for "the host cancelled it" is a Delete webhook on
-- public.events. It does not work: webhooks are AFTER triggers, and
-- participants.event_id is ON DELETE CASCADE, so by the time the hook
-- fires the attendee list it needs has already been deleted with the
-- event. The push would go out to nobody, silently.
--
-- So the audience is captured BEFORE the row goes, into a table whose
-- INSERT the webhook listens to instead. That also gives the push
-- something durable to read: the title survives the event.
--
-- Rows here are of no use once sent; a nightly prune keeps the table
-- from growing forever.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create table if not exists public.event_cancellations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null,
  title      text not null,
  creator_id uuid,
  /** Everyone who was attending, creator included. */
  audience   uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.event_cancellations enable row level security;
-- No client ever reads or writes this: it exists for the webhook, which
-- authenticates with the service key and bypasses RLS. Enabling RLS with
-- no policy is what makes that explicit.

create or replace function public.capture_event_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_audience uuid[];
begin
  -- Imported events are deleted in bulk by the ingest job when a source
  -- drops them; nobody joined those and nobody wants the push.
  if old.source <> 'user' then
    return old;
  end if;

  select coalesce(array_agg(distinct pa.user_id), '{}')
    into v_audience
    from public.participants pa
   where pa.event_id = old.id;

  -- A solo event — the host deleting something nobody joined — is not
  -- worth a notification to the host about their own action.
  if array_length(v_audience, 1) is null
     or v_audience = array[old.creator_id] then
    return old;
  end if;

  insert into public.event_cancellations (event_id, title, creator_id, audience)
  values (old.id, old.title, old.creator_id, v_audience);

  return old;
end;
$$;

drop trigger if exists events_capture_cancellation on public.events;
create trigger events_capture_cancellation
  before delete on public.events
  for each row execute function public.capture_event_cancellation();

/** Housekeeping — the rows are spent once the webhook has read them. */
create or replace function public.prune_event_cancellations()
returns void language sql security definer set search_path = public as $$
  delete from public.event_cancellations where created_at < now() - interval '3 days';
$$;

revoke execute on function public.prune_event_cancellations() from authenticated, anon;
