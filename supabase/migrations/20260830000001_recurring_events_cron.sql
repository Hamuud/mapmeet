-- MapMeet — keep every series topped up to the horizon, and let people
-- other than the host see that an event repeats.
--
-- events.repeat_every is denormalised from the series on purpose.
-- event_series is readable only by its creator (it holds the template
-- and the rule, which are the host's business), but "Repeats weekly" is
-- worth showing to anyone looking at the event — it is the difference
-- between "I missed it" and "I'll go next week". Copying one text column
-- onto the occurrence is far cheaper than widening the series policy.
--
-- Idempotent: safe to re-run.

alter table public.events
  add column if not exists repeat_every text;

do $$ begin
  alter table public.events drop constraint if exists events_repeat_every_check;
  alter table public.events
    add constraint events_repeat_every_check
    check (repeat_every is null or repeat_every in ('weekly','fortnightly','monthly'));
end $$;

/** Keep the denormalised copy true, in both directions: it is set when
 *  an event belongs to a series and cleared when it stops. Cheaper and
 *  harder to forget than setting it at each of the three call sites. */
create or replace function public.sync_event_repeat_every()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.series_id is null then
    new.repeat_every := null;
  else
    select s.repeat_every into new.repeat_every
      from public.event_series s where s.id = new.series_id;
  end if;
  return new;
end;
$$;

drop trigger if exists events_sync_repeat_every on public.events;
create trigger events_sync_repeat_every
  before insert or update of series_id on public.events
  for each row execute function public.sync_event_repeat_every();

-- Backfill anything created before this trigger existed.
update public.events e
   set repeat_every = s.repeat_every
  from public.event_series s
 where e.series_id = s.id
   and e.repeat_every is distinct from s.repeat_every;

-- ---------------------------------------------------------------------
-- The daily top-up
-- ---------------------------------------------------------------------
-- Generation is idempotent (unique on series_id, event_date), so this
-- only ever adds the newly-visible edge of the horizon. Runs entirely
-- inside Postgres: no Edge Function, no secret, no network hop.
--
-- 03:40 UTC, after the ingest at :25 — both add pins, and running them
-- apart keeps a slow ingest from delaying the series top-up.
create extension if not exists pg_cron;

select cron.unschedule('mapmeet-series-generate')
 where exists (select 1 from cron.job where jobname = 'mapmeet-series-generate');

select cron.schedule(
  'mapmeet-series-generate',
  '40 3 * * *',
  $job$ select public.generate_all_series(); $job$
);
