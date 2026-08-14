-- MapMeet — database webhooks for the `notify` Edge Function.
--
-- The Dashboard's "Database Webhooks" feature would do this too, but it
-- builds triggers whose header JSON is a literal in the trigger
-- definition. Our auth header is a secret, and a migration is a file in
-- git, so that route either leaks the secret or leaves eight webhooks
-- undocumented in a dashboard nobody diffs.
--
-- So: one trigger function, reading the secret from Vault at fire time,
-- and eight triggers pointing at it. Two other things fall out of owning
-- the trigger ourselves — WHEN clauses, so a row that cannot possibly be
-- news never costs an HTTP request at all, and a payload we shape to
-- match what the function already expects.

create extension if not exists pg_net;

-- The secret lives in Vault, not in this file. Set it with:
--   select vault.create_secret('<value>', 'notify_secret',
--                              'x-notify-secret header for the notify fn');
-- and rotate it with vault.update_secret(). A missing secret makes the
-- function reject the call (it fails closed), so the failure mode is
-- silence, not an open endpoint.

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_record jsonb;
  v_old    jsonb;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'notify_secret'
   limit 1;

  -- No secret configured: post nothing rather than post unauthenticated.
  -- Never raise — a failed notification must not roll back the message
  -- that triggered it.
  if v_secret is null then
    return null;
  end if;

  -- OLD is unassigned on INSERT and NEW on DELETE; branch rather than
  -- relying on CASE laziness to keep plpgsql from resolving either.
  if tg_op = 'DELETE' then
    v_record := null;
  else
    v_record := to_jsonb(new);
  end if;
  if tg_op = 'INSERT' then
    v_old := null;
  else
    v_old := to_jsonb(old);
  end if;

  -- pg_net is asynchronous: this queues the request and returns, so a
  -- slow Edge Function can never hold a chat message's COMMIT open.
  perform net.http_post(
    url     := 'https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-notify-secret', v_secret),
    body    := jsonb_build_object(
                 'type', tg_op,
                 'table', tg_table_name,
                 'schema', tg_table_schema,
                 'record', v_record,
                 'old_record', v_old),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

comment on function public.notify_push() is
  'AFTER trigger: posts the row to the notify Edge Function, authenticated with the notify_secret Vault secret.';

-- ── Chats ────────────────────────────────────────────────────────────
-- System rows carry no sender; the function skips them, but filtering
-- here means they never leave the database in the first place.
drop trigger if exists notify_event_message on public.messages;
create trigger notify_event_message
  after insert on public.messages
  for each row
  when (new.sender_id is not null and new.type is distinct from 'system')
  execute function public.notify_push();

drop trigger if exists notify_group_message on public.group_messages;
create trigger notify_group_message
  after insert on public.group_messages
  for each row
  when (new.sender_id is not null and new.type is distinct from 'system')
  execute function public.notify_push();

drop trigger if exists notify_dm on public.dm_messages;
create trigger notify_dm
  after insert on public.dm_messages
  for each row
  execute function public.notify_push();

-- ── Joins ────────────────────────────────────────────────────────────
drop trigger if exists notify_event_join on public.participants;
create trigger notify_event_join
  after insert on public.participants
  for each row
  execute function public.notify_push();

drop trigger if exists notify_group_join on public.group_members;
create trigger notify_group_join
  after insert on public.group_members
  for each row
  execute function public.notify_push();

-- ── Friendships ──────────────────────────────────────────────────────
drop trigger if exists notify_friend_request on public.friendships;
create trigger notify_friend_request
  after insert on public.friendships
  for each row
  when (new.status = 'pending')
  execute function public.notify_push();

-- Only the crossing into 'accepted' is news. Without the WHEN, every
-- unrelated update to the row would wake the Edge Function to decide the
-- same thing at more expense.
drop trigger if exists notify_friend_accept on public.friendships;
create trigger notify_friend_accept
  after update on public.friendships
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.notify_push();

-- ── Event moved / cancelled ──────────────────────────────────────────
-- `events` is updated far more often than it is *changed* in any way an
-- attendee cares about: reminder_sent, archive_warned and
-- coming_poll_created all flip on the same row. The function ignores
-- those, but the WHEN clause means we never pay for the round trip —
-- which matters most for mark_reminders_sent(), where the digest run
-- would otherwise trigger one webhook per event it just notified about.
drop trigger if exists notify_event_change on public.events;
create trigger notify_event_change
  after update on public.events
  for each row
  when (
    new.event_date is distinct from old.event_date
    or new.event_time is distinct from old.event_time
    or new.latitude  is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.title     is distinct from old.title
  )
  execute function public.notify_push();

-- Cancellation is a hook on event_cancellations, NOT a delete hook on
-- events: participants cascades, so by the time an AFTER DELETE fires
-- the audience is already gone. The BEFORE DELETE trigger in
-- 20260817000000 stashes them here first.
drop trigger if exists notify_event_cancel on public.event_cancellations;
create trigger notify_event_cancel
  after insert on public.event_cancellations
  for each row
  execute function public.notify_push();
