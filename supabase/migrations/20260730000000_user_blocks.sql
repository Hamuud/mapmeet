-- =========================================================================
-- MapMeet — user block list (Telegram/Viber style)
-- =========================================================================
-- Blocking a user (blocker → blocked):
--   * Neither can DM the other until the blocker unblocks (send_dm /
--     send_dm_voice / create_dm_poll reject when a block exists either
--     way).
--   * The blocked user can no longer see the blocker's attending events
--     (list_attending_event_ids returns empty for them).
--   * Shared GROUP and EVENT chats are untouched — you still see their
--     messages there.
--   * On block, a one-off system message "You have been blocked by a
--     user" is posted into the DM so the blocked user sees it.
--
-- Idempotent. Depends on 20260722 (dms), 20260724 (send_dm*), 20260727
-- (create_dm_poll), 20260728 (mark_dm_read), 20260729 (attending vis).
-- =========================================================================

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
drop policy if exists "read own blocks" on public.blocks;
create policy "read own blocks" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

-- ── Helpers ──────────────────────────────────────────────────────────────

create or replace function public.is_blocked(p_blocker uuid, p_blocked uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks where blocker_id = p_blocker and blocked_id = p_blocked
  );
$$;

-- A block in EITHER direction — used to gate DMs both ways.
create or replace function public.dm_block_active(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

-- ── Block / unblock / state ──────────────────────────────────────────────

create or replace function public.block_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_dm uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target = auth.uid() then
    raise exception 'cannot block yourself' using errcode = '23514';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (auth.uid(), p_target)
  on conflict do nothing;

  -- Only on a NEW block: post the notice the blocked user sees.
  if found then
    v_dm := public.get_or_create_dm(p_target);
    insert into public.dm_messages (dm_id, sender_id, type, text)
    values (v_dm, null, 'system', 'You have been blocked by a user');
  end if;
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_target;
end;
$$;

create or replace function public.get_block_state(p_other uuid)
returns table (i_blocked boolean, they_blocked boolean)
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = p_other),
    exists (select 1 from public.blocks where blocker_id = p_other and blocked_id = auth.uid());
$$;

-- ── DM sends now carry a system type + reject when blocked ───────────────

alter table public.dm_messages drop constraint if exists dm_messages_type_check;
alter table public.dm_messages add constraint dm_messages_type_check
  check (type in ('text', 'invite', 'audio', 'poll', 'system'));

-- System messages (the block notice) have no author.
alter table public.dm_messages alter column sender_id drop not null;

create or replace function public.send_dm(
  p_recipient uuid, p_text text, p_reply_to uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dm_id uuid; v_msg_id uuid; v_body text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.dm_block_active(auth.uid(), p_recipient) then
    raise exception 'you can''t message this user' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'message must be 1-2000 characters' using errcode = '23514';
  end if;
  v_dm_id := public.get_or_create_dm(p_recipient);
  if not public.dm_cold_ok(v_dm_id, p_recipient) then
    raise exception 'add them as a friend to send more messages' using errcode = '42501';
  end if;
  insert into public.dm_messages (dm_id, sender_id, type, text, reply_to)
  values (v_dm_id, auth.uid(), 'text', v_body, p_reply_to)
  returning id into v_msg_id;
  return v_msg_id;
end;
$$;

create or replace function public.send_dm_voice(
  p_recipient uuid, p_media_url text, p_duration_ms integer,
  p_waveform smallint[], p_reply_to uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dm_id uuid; v_msg_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.dm_block_active(auth.uid(), p_recipient) then
    raise exception 'you can''t message this user' using errcode = '42501';
  end if;
  if coalesce(btrim(p_media_url), '') = '' then
    raise exception 'missing audio' using errcode = '23514';
  end if;
  v_dm_id := public.get_or_create_dm(p_recipient);
  if not public.dm_cold_ok(v_dm_id, p_recipient) then
    raise exception 'add them as a friend to send more messages' using errcode = '42501';
  end if;
  insert into public.dm_messages
    (dm_id, sender_id, type, media_url, duration_ms, waveform, reply_to)
  values (v_dm_id, auth.uid(), 'audio', p_media_url,
          greatest(1, coalesce(p_duration_ms, 1)), p_waveform, p_reply_to)
  returning id into v_msg_id;
  return v_msg_id;
end;
$$;

create or replace function public.create_dm_poll(
  p_dm        uuid,
  p_question  text,
  p_options   text[],
  p_anonymous boolean default false,
  p_reply_to  uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_q     text := btrim(coalesce(p_question, ''));
  v_opts  jsonb := public.poll_build_options(p_options);
  v_other uuid;
begin
  if not public.is_dm_member(p_dm, auth.uid()) then
    raise exception 'not part of this conversation' using errcode = '42501';
  end if;
  select case when user_a = auth.uid() then user_b else user_a end
    into v_other from public.dms where id = p_dm;
  if public.dm_block_active(auth.uid(), v_other) then
    raise exception 'you can''t message this user' using errcode = '42501';
  end if;
  if not public.dm_cold_ok(p_dm, v_other) then
    raise exception 'add them as a friend to send more messages' using errcode = '42501';
  end if;
  if char_length(v_q) < 1 then
    raise exception 'poll needs a question' using errcode = '23514';
  end if;
  if jsonb_array_length(v_opts) < 2 then
    raise exception 'poll needs at least 2 options' using errcode = '23514';
  end if;

  insert into public.dm_messages (dm_id, sender_id, type, text, reply_to, poll)
  values (p_dm, auth.uid(), 'poll', v_q, p_reply_to,
          jsonb_build_object('question', v_q, 'anonymous', coalesce(p_anonymous, false), 'options', v_opts))
  returning id into v_id;
  return v_id;
end;
$$;

-- Mark system messages read too (sender_id is null), so the block notice
-- doesn't leave a stuck unread badge.
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
     and (sender_id is null or sender_id <> auth.uid())
     and not (read_by @> array[auth.uid()]);
end;
$$;

-- ── Attending events are hidden from someone you've blocked ──────────────

create or replace function public.list_attending_event_ids(p_target uuid)
returns setof uuid language plpgsql security definer stable set search_path = public as $$
declare
  v_vis text;
begin
  if auth.uid() is null then
    return;
  end if;

  if p_target <> auth.uid() then
    -- Blocked users can't see the blocker's attending events at all.
    if public.is_blocked(p_target, auth.uid()) then
      return;
    end if;
    select attending_visibility into v_vis from public.profiles where id = p_target;
    v_vis := coalesce(v_vis, 'everyone');
    if v_vis = 'nobody' then
      return;
    end if;
    if v_vis = 'friends' and not public.is_friend(auth.uid(), p_target) then
      return;
    end if;
  end if;

  return query
    select p.event_id
      from public.participants p
      join public.events e on e.id = p.event_id
     where p.user_id = p_target
       and e.creator_id <> p_target;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function public.is_blocked(uuid, uuid)        to authenticated;
grant execute on function public.dm_block_active(uuid, uuid)   to authenticated;
grant execute on function public.block_user(uuid)              to authenticated;
grant execute on function public.unblock_user(uuid)            to authenticated;
grant execute on function public.get_block_state(uuid)         to authenticated;
grant execute on function public.send_dm(uuid, text, uuid)     to authenticated;
grant execute on function public.send_dm_voice(uuid, text, integer, smallint[], uuid) to authenticated;
grant execute on function public.create_dm_poll(uuid, text, text[], boolean, uuid)    to authenticated;
grant execute on function public.mark_dm_read(uuid)            to authenticated;
grant execute on function public.list_attending_event_ids(uuid) to authenticated;
