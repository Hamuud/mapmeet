-- =========================================================================
-- MapMeet — push tokens + archive-warning system message
-- =========================================================================
--   * profiles.push_token   — Expo push token, targeted by the notify
--                             Edge Function (see supabase/functions/notify).
--   * events.archive_warned — one-shot flag so the "chat archives soon"
--                             system message is posted at most once.
--   * post_archive_warning  — RPC that flips the flag atomically and
--                             posts the system message. Called by the
--                             client when an event enters the 30-min
--                             pre-archive window (isArchiveWarningDue).
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists push_token text;

alter table public.events
  add column if not exists archive_warned boolean not null default false;

-- Atomic + deduped: only the caller that flips `archive_warned` from
-- false posts the message, so concurrent clients can't double-post.
-- Timing ("is it actually due?") is decided client-side; the RPC only
-- guards membership + the one-shot flag.
create or replace function public.post_archive_warning(p_event_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_rows integer := 0;
begin
  if not public.is_event_member(p_event_id, auth.uid()) then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;

  update public.events
     set archive_warned = true
   where id = p_event_id and archive_warned = false;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return; -- already warned (or no such event)
  end if;

  insert into public.messages (event_id, sender_id, type, text)
  values (
    p_event_id, null, 'system',
    '⏳ This chat moves to Archive in 30 minutes — the event is wrapping up. Wrap up any plans!'
  );
end;
$$;
