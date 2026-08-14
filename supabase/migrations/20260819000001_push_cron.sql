-- MapMeet — scheduled pushes: reminders and the area round-up.
--
-- Both call the `digest` Edge Function, which decides who (if anyone)
-- should hear anything; the schedule only decides how often it is asked.
-- Like the webhook trigger, the secret is read from Vault at fire time
-- rather than written into the job body — cron.job is world-readable to
-- anything with the postgres role, and a rotated secret should not mean
-- rewriting jobs.
--
-- Set the secret first:
--   select vault.create_secret('<value>', 'digest_secret', '…');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule before scheduling so re-running this file
-- replaces the jobs instead of erroring on the duplicate name.
select cron.unschedule('mapmeet-reminders')
 where exists (select 1 from cron.job where jobname = 'mapmeet-reminders');
select cron.unschedule('mapmeet-digest')
 where exists (select 1 from cron.job where jobname = 'mapmeet-digest');

-- Reminders — every 15 minutes.
--
-- due_event_reminders() only returns events starting inside the next 75
-- minutes that have not already been reminded, and mark_reminders_sent()
-- flips a one-shot flag, so the frequency changes nothing except how
-- close to "an hour before" the push actually lands. Every 15 min puts
-- it between 60 and 75 minutes ahead.
select cron.schedule(
  'mapmeet-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/digest?job=reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-digest-secret',
                 (select decrypted_secret from vault.decrypted_secrets
                   where name = 'digest_secret' limit 1)),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);

-- Area round-up — hourly at :07, NOT daily.
--
-- "Once a day" is the user-facing promise, but the sweep has to be
-- hourly to keep it: digest_audience() only returns people whose OWN
-- clock reads 10:00–21:00, so an hourly pass is what lets each timezone
-- come round in its own daytime. Per person the 20-hour floor on
-- digest_last_sent_at still caps it at one push a day, and the
-- five-event minimum is what quietly turns that into "every day or two"
-- in a quiet area.
select cron.schedule(
  'mapmeet-digest',
  '7 * * * *',
  $job$
  select net.http_post(
    url     := 'https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/digest?job=digest',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-digest-secret',
                 (select decrypted_secret from vault.decrypted_secrets
                   where name = 'digest_secret' limit 1)),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
