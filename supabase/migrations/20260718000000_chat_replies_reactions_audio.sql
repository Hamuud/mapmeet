-- =========================================================================
-- MapMeet — chat: replies, emoji reactions, voice messages
-- =========================================================================
--   * reply_to    — Telegram-style quoting. FK to the quoted message;
--                   ON DELETE SET NULL so quoting survives moderation.
--   * reactions   — jsonb map of emoji → uuid[] of reactors. Mutated
--                   only through the toggle_reaction RPC (whitelisted
--                   emoji, membership-checked, one toggle per user).
--   * 'audio'     — new message type for voice notes; media_url points
--                   at chat-media, duration_ms carries the length so
--                   the bubble can render it before loading the file.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null,
  add column if not exists reactions jsonb not null default '{}'::jsonb,
  add column if not exists duration_ms integer check (duration_ms is null or duration_ms > 0);

-- Widen the type check to include audio.
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'video', 'location', 'audio', 'system'));

-- Recreate the INSERT policy with audio allowed.
drop policy if exists "members write own messages" on public.messages;
create policy "members write own messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and type in ('text', 'image', 'video', 'location', 'audio')
    and public.is_event_member(event_id, auth.uid())
  );

-- Toggle a reaction. Whitelist keeps the palette fixed (matches the
-- client's quick-reaction row) and blocks arbitrary-string bloat.
create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
as $$
declare
  v_event uuid;
  v_uid uuid := auth.uid();
  v_current jsonb;
  v_users jsonb;
begin
  if p_emoji not in ('❤️', '👍', '😂', '😮', '😢', '🔥') then
    raise exception 'unsupported reaction';
  end if;

  select event_id, reactions into v_event, v_current
  from public.messages where id = p_message_id;
  if v_event is null or not public.is_event_member(v_event, v_uid) then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;

  v_users := coalesce(v_current -> p_emoji, '[]'::jsonb);

  if v_users @> to_jsonb(array[v_uid]) then
    -- Already reacted → remove this user.
    select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
    from jsonb_array_elements_text(v_users) as t(u)
    where u <> v_uid::text;
  else
    v_users := v_users || to_jsonb(array[v_uid]);
  end if;

  if jsonb_array_length(v_users) = 0 then
    v_current := coalesce(v_current, '{}'::jsonb) - p_emoji;
  else
    v_current := jsonb_set(coalesce(v_current, '{}'::jsonb), array[p_emoji], v_users);
  end if;

  update public.messages set reactions = v_current where id = p_message_id;
end;
$$;
