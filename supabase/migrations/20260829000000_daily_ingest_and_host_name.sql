-- =========================================================================
-- MapMeet — imported events: refresh daily, and stop naming the source
-- =========================================================================
-- Two changes to the same feature.
--
-- 1. DAILY, NOT WEEKLY
--    ingest-events fetches a rolling window of `now → now + 7 days`, but
--    the job only ran on Sunday nights. So Monday showed a full week and
--    Saturday showed one day — the horizon shrank as the week wore on,
--    which is exactly backwards from how people plan. Running it every
--    day keeps a true seven-day view: each run adds the newly-visible
--    day and re-upserts the rest.
--
--    Cheap to do daily: the source is upserted on (source, source_id),
--    so a re-run of an unchanged event is an UPDATE of identical values,
--    not a duplicate.
--
--    ⚠ The schedule is changed by CARRYING THE EXISTING COMMAND ACROSS
--    rather than retyping it. That command embeds the ingest secret in
--    plaintext, and this file is committed to a public repository — so
--    the secret is read out of cron.job and written straight back, never
--    passing through the migration text.
--
-- 2. THE BYLINE STOPS SAYING KARABAS
--    Imported events are owned by a bot profile whose display_name the
--    whole UI renders as the host. It said "Karabas"; it now says
--    "MapMeet".
--
--    Deliberately NOT renamed: `event_sources.display_name`, which stays
--    'Karabas'. That row is the operator's record of where the data
--    comes from — it is behind RLS, no client reads it, and making it
--    lie would only mislead whoever next debugs the ingest.
--
--    Also unchanged: `events.source_url`, which still points at
--    karabas.com. It has to — it is where the tickets actually are, and
--    the Tickets button opens it.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Daily
-- -------------------------------------------------------------------------
do $$
declare
  v_cmd  text;
  v_name text;
begin
  select jobname, command into v_name, v_cmd
    from cron.job
   where jobname in ('mapmeet-ingest-weekly', 'mapmeet-ingest-daily')
   order by jobname   -- prefer the daily one if a re-run already made it
   limit 1;

  if v_cmd is null then
    raise notice 'no ingest job found; nothing to reschedule';
    return;
  end if;

  if v_name = 'mapmeet-ingest-weekly' then
    perform cron.unschedule('mapmeet-ingest-weekly');
  else
    perform cron.unschedule('mapmeet-ingest-daily');
  end if;

  -- 03:25 UTC = 06:25 in Kyiv: the next day's events are in place before
  -- anyone opens the app, and it misses the digest (:07) and the
  -- reminder sweep (every :15) rather than piling onto them.
  perform cron.schedule('mapmeet-ingest-daily', '25 3 * * *', v_cmd);
end $$;

-- -------------------------------------------------------------------------
-- 2. The host name people see
-- -------------------------------------------------------------------------
-- Every imported event's creator is this profile, and the event card,
-- the preview and the pin all read creator.display_name.
update public.profiles p
   set username     = 'mapmeet',
       display_name = 'MapMeet'
  from public.event_sources s
 where s.bot_profile_id = p.id
   and p.username <> 'mapmeet';
