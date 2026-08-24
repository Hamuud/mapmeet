-- MapMeet — sweep lapsed subscriptions hourly.
--
-- `entitled_until` already ends ACCESS on time with no help from
-- anybody: can_style_pin() compares it to now(). What it does not do is
-- move profiles.role, which is a cache of the entitlement and drives the
-- premium badge. Without this sweep an ex-subscriber would keep wearing
-- the badge until they next did something that triggered a sync.
--
-- Runs entirely inside Postgres — no Edge Function, no secret, no
-- network hop. Hourly is plenty: the drift it corrects is cosmetic, and
-- the EXPIRATION webhook normally does the job within seconds.
--
-- Idempotent: safe to re-run.

create extension if not exists pg_cron;

select cron.unschedule('mapmeet-subscriptions-expire')
 where exists (select 1 from cron.job where jobname = 'mapmeet-subscriptions-expire');

select cron.schedule(
  'mapmeet-subscriptions-expire',
  '17 * * * *',
  $job$ select public.expire_lapsed_subscriptions(); $job$
);
