-- =========================================================================
-- MapMeet — bring voice / replies / reactions to group + DM chats
-- =========================================================================
-- Event chats already have voice notes, Telegram-style replies and emoji
-- reactions (see 20260718000000). This carries the same three features to
-- group_messages and dm_messages:
--
--   * reply_to    — FK to the quoted message, ON DELETE SET NULL
--   * reactions   — jsonb emoji → uuid[] of reactors, mutated only via a
--                   whitelisted toggle RPC (same palette as events)
--   * 'audio'     — new message type; media_url in chat-media, duration_ms
--                   + waveform so the bubble renders before loading
--
-- Writes stay RPC-only (no INSERT policies on these tables), so the send
-- helpers gain reply/voice variants and the reaction toggle lives server
-- side. The DM 1-message-per-side cold rule now also counts voice.
--
-- Idempotent: safe to re-run. Depends on 20260722 (dms) + 20260723 (groups).
-- =========================================================================

-- ── group_messages ────────────────────────────────────────────────────────

alter table public.group_messages
  add column if not exists reply_to    uuid references public.group_messages(id) on delete set null,
  add column if not exists reactions   jsonb not null default '{}'::jsonb,
  add column if not exists media_url    text,
  add column if not exists duration_ms  integer check (duration_ms is null or duration_ms > 0),
  add column if not exists waveform     smallint[];

alter table public.group_messages drop constraint if exists group_messages_type_check;
alter table public.group_messages
  add constraint group_messages_type_check check (type in ('text', 'audio', 'system'));

-- Text send, now with an optional reply. Replaces the 2-arg version
-- (drop first — a default-arg overload would be ambiguous with it).
drop function if exists public.send_group_message(uuid, text);
create or replace function public.send_group_message(
  p_group uuid, p_text text, p_reply_to uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := btrim(coalesce(p_text, ''));
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'message must be 1-2000 characters' using errcode = '23514';
  end if;
  insert into public.group_messages (group_id, sender_id, type, text, reply_to)
  values (p_group, auth.uid(), 'text', v_body, p_reply_to)
  returning id into v_id;
  update public.group_chats set updated_at = timezone('utc', now()) where id = p_group;
  return v_id;
end;
$$;

create or replace function public.send_group_voice(
  p_group uuid, p_media_url text, p_duration_ms integer,
  p_waveform smallint[], p_reply_to uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if coalesce(btrim(p_media_url), '') = '' then
    raise exception 'missing audio' using errcode = '23514';
  end if;
  insert into public.group_messages
    (group_id, sender_id, type, media_url, duration_ms, waveform, reply_to)
  values (p_group, auth.uid(), 'audio', p_media_url,
          greatest(1, coalesce(p_duration_ms, 1)), p_waveform, p_reply_to)
  returning id into v_id;
  update public.group_chats set updated_at = timezone('utc', now()) where id = p_group;
  return v_id;
end;
$$;

create or replace function public.toggle_group_reaction(p_message_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_group uuid; v_uid uuid := auth.uid(); v_current jsonb; v_users jsonb;
begin
  if p_emoji not in ('❤️', '👍', '😂', '😮', '😢', '🔥') then
    raise exception 'unsupported reaction';
  end if;
  select group_id, reactions into v_group, v_current
    from public.group_messages where id = p_message_id;
  if v_group is null or not public.is_group_member(v_group, v_uid) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  v_users := coalesce(v_current -> p_emoji, '[]'::jsonb);
  if v_users @> to_jsonb(array[v_uid]) then
    select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
      from jsonb_array_elements_text(v_users) as t(u) where u <> v_uid::text;
  else
    v_users := v_users || to_jsonb(array[v_uid]);
  end if;
  if jsonb_array_length(v_users) = 0 then
    v_current := coalesce(v_current, '{}'::jsonb) - p_emoji;
  else
    v_current := jsonb_set(coalesce(v_current, '{}'::jsonb), array[p_emoji], v_users);
  end if;
  update public.group_messages set reactions = v_current where id = p_message_id;
end;
$$;

-- ── dm_messages ────────────────────────────────────────────────────────────

alter table public.dm_messages
  add column if not exists reply_to    uuid references public.dm_messages(id) on delete set null,
  add column if not exists reactions   jsonb not null default '{}'::jsonb,
  add column if not exists media_url    text,
  add column if not exists duration_ms  integer check (duration_ms is null or duration_ms > 0),
  add column if not exists waveform     smallint[];

alter table public.dm_messages drop constraint if exists dm_messages_type_check;
alter table public.dm_messages
  add constraint dm_messages_type_check check (type in ('text', 'invite', 'audio'));

-- One private helper for the cold-DM rule so send_dm + send_dm_voice
-- can't drift. Counts ALL of the caller's messages in the room (text
-- and voice both), so a non-friend still gets exactly one, whatever type.
create or replace function public.dm_cold_ok(p_dm uuid, p_recipient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_friend(auth.uid(), p_recipient)
      or (select count(*) from public.dm_messages
           where dm_id = p_dm and sender_id = auth.uid()) < 1;
$$;

drop function if exists public.send_dm(uuid, text);
create or replace function public.send_dm(
  p_recipient uuid, p_text text, p_reply_to uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dm_id uuid; v_msg_id uuid; v_body text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
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

create or replace function public.toggle_dm_reaction(p_message_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dm uuid; v_uid uuid := auth.uid(); v_current jsonb; v_users jsonb;
begin
  if p_emoji not in ('❤️', '👍', '😂', '😮', '😢', '🔥') then
    raise exception 'unsupported reaction';
  end if;
  select dm_id, reactions into v_dm, v_current
    from public.dm_messages where id = p_message_id;
  if v_dm is null or not public.is_dm_member(v_dm, v_uid) then
    raise exception 'not a member of this DM' using errcode = '42501';
  end if;
  v_users := coalesce(v_current -> p_emoji, '[]'::jsonb);
  if v_users @> to_jsonb(array[v_uid]) then
    select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
      from jsonb_array_elements_text(v_users) as t(u) where u <> v_uid::text;
  else
    v_users := v_users || to_jsonb(array[v_uid]);
  end if;
  if jsonb_array_length(v_users) = 0 then
    v_current := coalesce(v_current, '{}'::jsonb) - p_emoji;
  else
    v_current := jsonb_set(coalesce(v_current, '{}'::jsonb), array[p_emoji], v_users);
  end if;
  update public.dm_messages set reactions = v_current where id = p_message_id;
end;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────

grant execute on function public.send_group_message(uuid, text, uuid)               to authenticated;
grant execute on function public.send_group_voice(uuid, text, integer, smallint[], uuid) to authenticated;
grant execute on function public.toggle_group_reaction(uuid, text)                  to authenticated;
grant execute on function public.send_dm(uuid, text, uuid)                          to authenticated;
grant execute on function public.send_dm_voice(uuid, text, integer, smallint[], uuid) to authenticated;
grant execute on function public.toggle_dm_reaction(uuid, text)                     to authenticated;
grant execute on function public.dm_cold_ok(uuid, uuid)                             to authenticated;
