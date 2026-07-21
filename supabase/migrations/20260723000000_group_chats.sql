-- =========================================================================
-- MapMeet — standalone group chats (friends, not tied to an event)
-- =========================================================================
-- Event chats reuse events/participants/messages. A group chat has no
-- event, so it gets its own small parallel set:
--
--   group_chats     — id, name, emoji, creator
--   group_members   — who's in it (creator auto-added)
--   group_messages  — text + system messages, read receipts, soft delete
--                     (deliberately simpler than event `messages`: no
--                      reactions/replies/voice for the MVP)
--   group_invites   — 24h shareable tokens, like event_invites
--
-- RULES
--   * Create / add members: FRIENDS ONLY. create_group and
--     add_group_members reject any target that isn't a mutual friend of
--     the actor (is_friend, from the friends migration).
--   * Share link: OPEN join. accept_group_invite lets ANYONE with a live
--     token join — that's the Telegram/Instagram-style invite the user
--     asked for, a deliberately broader path than the friends-only
--     direct add.
--   * Writes are RPC-only (no INSERT policies) so those rules live in
--     one place; reads are scoped to members via RLS.
--
-- Idempotent: safe to re-run. Depends on 20260722000000 (is_friend).
-- =========================================================================

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.group_chats (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  emoji      text not null default '💬' check (char_length(emoji) between 1 and 8),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_members (
  group_id   uuid not null references public.group_chats(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)    on delete cascade,
  joined_at  timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.group_chats(id) on delete cascade,
  sender_id   uuid references public.profiles(id) on delete set null, -- null = system
  type        text not null default 'text' check (type in ('text', 'system')),
  text        text check (text is null or char_length(text) <= 2000),
  read_by     uuid[] not null default '{}',
  deleted_for uuid[] not null default '{}',
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);

create table if not exists public.group_invites (
  token      text primary key,
  group_id   uuid not null references public.group_chats(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id)    on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists group_invites_group_idx on public.group_invites (group_id);

alter table public.group_chats    enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_invites  enable row level security;

-- ── Membership helper (definer, so RLS policies don't recurse) ───────────

create or replace function public.is_group_member(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
     where group_id = p_group and user_id = p_user
  );
$$;

-- ── RLS: members read; writes are RPC-only ───────────────────────────────

drop policy if exists "members read group" on public.group_chats;
create policy "members read group" on public.group_chats
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));

drop policy if exists "members read group members" on public.group_members;
create policy "members read group members" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "members read group messages" on public.group_messages;
create policy "members read group messages" on public.group_messages
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- ── RPCs ─────────────────────────────────────────────────────────────────

-- Create a group with the caller + a set of their friends. Rejects any
-- proposed member who isn't a mutual friend.
create or replace function public.create_group(
  p_name      text,
  p_emoji     text,
  p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_creator_name text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'group name must be 1-60 characters' using errcode = '23514';
  end if;

  foreach v_id in array coalesce(p_member_ids, '{}') loop
    if v_id <> auth.uid() and not public.is_friend(auth.uid(), v_id) then
      raise exception 'you can only add friends to a group' using errcode = '42501';
    end if;
  end loop;

  insert into public.group_chats (name, emoji, creator_id)
  values (v_name, coalesce(nullif(btrim(p_emoji), ''), '💬'), auth.uid())
  returning id into v_group;

  insert into public.group_members (group_id, user_id) values (v_group, auth.uid());
  foreach v_id in array coalesce(p_member_ids, '{}') loop
    if v_id <> auth.uid() then
      insert into public.group_members (group_id, user_id)
      values (v_group, v_id) on conflict do nothing;
    end if;
  end loop;

  select display_name into v_creator_name from public.profiles where id = auth.uid();
  insert into public.group_messages (group_id, sender_id, type, text)
  values (v_group, null, 'system',
          coalesce(v_creator_name, 'Someone') || ' created the group');

  return v_group;
end;
$$;

-- Add more friends to an existing group (member-only, friends-of-actor).
create or replace function public.add_group_members(p_group uuid, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_member_ids, '{}') loop
    if v_id = auth.uid() then continue; end if;
    if not public.is_friend(auth.uid(), v_id) then
      raise exception 'you can only add friends to a group' using errcode = '42501';
    end if;
    if not public.is_group_member(p_group, v_id) then
      insert into public.group_members (group_id, user_id) values (p_group, v_id);
      select display_name into v_name from public.profiles where id = v_id;
      insert into public.group_messages (group_id, sender_id, type, text)
      values (p_group, null, 'system', coalesce(v_name, 'Someone') || ' was added to the group');
    end if;
  end loop;
end;
$$;

create or replace function public.send_group_message(p_group uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_body text := btrim(coalesce(p_text, ''));
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'message must be 1-2000 characters' using errcode = '23514';
  end if;
  insert into public.group_messages (group_id, sender_id, type, text)
  values (p_group, auth.uid(), 'text', v_body)
  returning id into v_id;
  update public.group_chats set updated_at = timezone('utc', now()) where id = p_group;
  return v_id;
end;
$$;

create or replace function public.mark_group_read(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  update public.group_messages
     set read_by = array_append(read_by, auth.uid())
   where group_id = p_group
     and (sender_id is null or sender_id <> auth.uid())
     and not (read_by @> array[auth.uid()]);
end;
$$;

-- Leave a group. Posts a system message; if the last member leaves the
-- group row lingers (harmless — no one can read it) rather than being
-- force-deleted.
create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_group_member(p_group, auth.uid()) then
    return;
  end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
  insert into public.group_messages (group_id, sender_id, type, text)
  values (p_group, null, 'system', coalesce(v_name, 'Someone') || ' left the group');
end;
$$;

-- ── Share links (24h, open join) ─────────────────────────────────────────

create or replace function public.create_group_invite(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  for i in 1..5 loop
    v_token := public.generate_invite_token();  -- from event-invites migration
    exit when not exists (select 1 from public.group_invites where token = v_token);
  end loop;
  insert into public.group_invites (token, group_id, inviter_id, expires_at)
  values (v_token, p_group, auth.uid(), now() + interval '24 hours');
  return v_token;
end;
$$;

create or replace function public.get_group_invite(p_token text)
returns table (
  group_id             uuid,
  group_name           text,
  group_emoji          text,
  member_count         bigint,
  inviter_display_name text,
  inviter_username     text,
  expires_at           timestamptz,
  expired              boolean
) language sql stable security definer set search_path = public as $$
  select
    g.id, g.name, g.emoji,
    (select count(*) from public.group_members m where m.group_id = g.id),
    p.display_name, p.username,
    i.expires_at,
    (i.expires_at < now()) as expired
  from public.group_invites i
  join public.group_chats g on g.id = i.group_id
  join public.profiles    p on p.id = i.inviter_id
  where i.token = p_token;
$$;

create or replace function public.accept_group_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group   uuid;
  v_expires timestamptz;
  v_name    text;
  v_new     boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select group_id, expires_at into v_group, v_expires
    from public.group_invites where token = p_token;
  if v_group is null then
    raise exception 'invite not found' using errcode = '42704';
  end if;
  if v_expires < now() then
    raise exception 'this invite has expired' using errcode = '42501';
  end if;
  v_new := not public.is_group_member(v_group, auth.uid());
  insert into public.group_members (group_id, user_id)
  values (v_group, auth.uid()) on conflict do nothing;
  if v_new then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.group_messages (group_id, sender_id, type, text)
    values (v_group, null, 'system', coalesce(v_name, 'Someone') || ' joined via invite');
  end if;
  return v_group;
end;
$$;

-- ── Realtime + grants ────────────────────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;

grant execute on function public.create_group(text, text, uuid[])   to authenticated;
grant execute on function public.add_group_members(uuid, uuid[])     to authenticated;
grant execute on function public.send_group_message(uuid, text)      to authenticated;
grant execute on function public.mark_group_read(uuid)               to authenticated;
grant execute on function public.leave_group(uuid)                   to authenticated;
grant execute on function public.create_group_invite(uuid)           to authenticated;
grant execute on function public.get_group_invite(text)              to authenticated;
grant execute on function public.accept_group_invite(text)           to authenticated;
