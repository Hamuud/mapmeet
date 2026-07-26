-- =========================================================================
-- MapMeet — last-seen presence + DM read timestamps
-- =========================================================================
--   * profiles.last_seen_at  — bumped by a client heartbeat (touch_last_seen)
--     while the app is foregrounded. The DM header reads it to show
--     "Online" (seen in the last couple of minutes) or "last seen …".
--   * dm_messages.read_at     — when the recipient first read the message.
--     mark_dm_read stamps it, so the sender can show the read TIME instead
--     of just ✓✓. 1:1 chats, so "read" is unambiguous.
--
-- Idempotent. Depends on 20260722 (dms / mark_dm_read).
-- =========================================================================

alter table public.profiles     add column if not exists last_seen_at timestamptz;
alter table public.dm_messages   add column if not exists read_at      timestamptz;

-- Heartbeat: mark the caller active now. Cheap single-row update.
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$;

-- Redefine mark_dm_read to also stamp read_at the first time the
-- recipient reads each message (coalesce keeps the original read time).
create or replace function public.mark_dm_read(p_dm uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dm_member(p_dm, auth.uid()) then
    raise exception 'not a member of this DM' using errcode = '42501';
  end if;
  update public.dm_messages
     set read_by = array_append(read_by, auth.uid()),
         read_at = coalesce(read_at, now())
   where dm_id = p_dm
     and sender_id <> auth.uid()
     and not (read_by @> array[auth.uid()]);
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.mark_dm_read(uuid) to authenticated;
