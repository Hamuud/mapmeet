-- =========================================================================
-- MapMeet — friends, direct messages, event invites
-- =========================================================================
-- WHAT + WHY
--   * friendships     — mutual (pending → accepted), asymmetric before accept.
--   * dms / dm_messages — 1:1 room per pair. Instagram-style "message
--     request" rule: if two users aren't friends, each of them can send
--     exactly ONE message. Becoming friends unlocks unlimited messaging.
--   * event_invites   — short-lived unguessable tokens (24h) that any
--     host-or-participant of an event can mint and share; accepting one
--     joins the recipient to the event.
--
-- DESIGN NOTES
--   Pair identity: friendships enforce one row per unordered pair via a
--   `least/greatest` unique index; dms use a canonical column order
--   (user_a < user_b) which lets us upsert on (user_a, user_b).
--   RLS: reads scoped to the two members; writes are RPC-only so the
--   1-message rule can't be bypassed by inserting rows directly.
--   Realtime: dm_messages joins the supabase_realtime publication;
--   postgres_changes respects RLS so non-members receive nothing.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- ── 1. Friendships ───────────────────────────────────────────────────────

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

-- One edge per pair regardless of direction — so we can't have both
-- (A,B) and (B,A) sitting around when both users click "Add friend".
create unique index if not exists friendships_pair_idx on public.friendships (
  least(requester_id, recipient_id), greatest(requester_id, recipient_id)
);
create index if not exists friendships_recipient_pending_idx
  on public.friendships (recipient_id) where status = 'pending';

alter table public.friendships enable row level security;

-- Definer helper — used from RLS policies on dm_messages so we can gate
-- writes on "are these two mutual friends?" without cross-table policy
-- recursion.
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester_id = a and recipient_id = b)
         or (requester_id = b and recipient_id = a))
  );
$$;

drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below,
-- so the "who can request whom" logic lives in one place.

create or replace function public.request_friendship(p_target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row public.friendships;
  v_id  uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target = auth.uid() then
    raise exception 'cannot friend yourself' using errcode = '23514';
  end if;

  select * into v_row from public.friendships
    where (requester_id = auth.uid() and recipient_id = p_target)
       or (requester_id = p_target and recipient_id = auth.uid())
    limit 1;

  if v_row.id is not null then
    if v_row.status = 'accepted' then
      return v_row.id;
    end if;
    -- Pending with them as requester → my click auto-accepts. Pending
    -- with me as requester → still pending, no-op.
    if v_row.requester_id = p_target then
      update public.friendships
         set status = 'accepted', responded_at = timezone('utc', now())
       where id = v_row.id
       returning id into v_id;
      return v_id;
    end if;
    return v_row.id;
  end if;

  insert into public.friendships (requester_id, recipient_id)
  values (auth.uid(), p_target)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_friendship(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.friendships
   where (requester_id = auth.uid() and recipient_id = p_other)
      or (requester_id = p_other and recipient_id = auth.uid());
end;
$$;

-- ── 2. DMs (1:1 chat) ────────────────────────────────────────────────────

create table if not exists public.dms (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table if not exists public.dm_messages (
  id                  uuid primary key default gen_random_uuid(),
  dm_id               uuid not null references public.dms(id) on delete cascade,
  sender_id           uuid not null references public.profiles(id) on delete cascade,
  type                text not null default 'text'
                        check (type in ('text', 'invite')),
  text                text check (text is null or char_length(text) <= 2000),
  -- Populated when type='invite'; points at event_invites.token. The
  -- token is what makes the row shareable; the recipient joins via
  -- accept_event_invite(token), not by knowing the event id.
  event_invite_token  text,
  read_by             uuid[] not null default '{}',
  created_at          timestamptz not null default timezone('utc', now())
);

create index if not exists dm_messages_dm_created_idx
  on public.dm_messages (dm_id, created_at desc);

alter table public.dms enable row level security;
alter table public.dm_messages enable row level security;

create or replace function public.is_dm_member(p_dm uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dms
     where id = p_dm and (user_a = p_user or user_b = p_user)
  );
$$;

drop policy if exists "read own dms" on public.dms;
create policy "read own dms" on public.dms
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists "read messages in own dms" on public.dm_messages;
create policy "read messages in own dms" on public.dm_messages
  for select to authenticated
  using (public.is_dm_member(dm_id, auth.uid()));
-- No INSERT policy on dm_messages: send_dm() enforces the 1-message
-- rule, no direct writes.

create or replace function public.get_or_create_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_a  uuid;
  v_b  uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_other = auth.uid() then
    raise exception 'cannot DM yourself' using errcode = '23514';
  end if;
  -- Canonicalize the pair so the same two users always resolve to one
  -- row regardless of who opens the DM first.
  if auth.uid() < p_other then v_a := auth.uid(); v_b := p_other;
                          else v_a := p_other;    v_b := auth.uid();
  end if;
  select id into v_id from public.dms where user_a = v_a and user_b = v_b;
  if v_id is not null then return v_id; end if;
  insert into public.dms (user_a, user_b) values (v_a, v_b) returning id into v_id;
  return v_id;
end;
$$;

-- The 1-message-per-side rule for non-friends. Add-friend removes the
-- cap for BOTH users automatically because is_friend flips to true.
create or replace function public.send_dm(p_recipient uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_dm_id   uuid;
  v_msg_id  uuid;
  v_body    text := btrim(coalesce(p_text, ''));
  v_count   integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'message must be 1-2000 characters' using errcode = '23514';
  end if;

  v_dm_id := public.get_or_create_dm(p_recipient);

  if not public.is_friend(auth.uid(), p_recipient) then
    select count(*)::int into v_count
      from public.dm_messages
     where dm_id = v_dm_id and sender_id = auth.uid();
    if v_count >= 1 then
      raise exception 'add them as a friend to send more messages'
        using errcode = '42501';
    end if;
  end if;

  insert into public.dm_messages (dm_id, sender_id, type, text)
  values (v_dm_id, auth.uid(), 'text', v_body)
  returning id into v_msg_id;
  return v_msg_id;
end;
$$;

-- Read receipts. Skipped for the sender's own rows so read_by only
-- means "the OTHER person saw it".
create or replace function public.mark_dm_read(p_dm uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dm_member(p_dm, auth.uid()) then
    raise exception 'not a member of this DM' using errcode = '42501';
  end if;
  update public.dm_messages
     set read_by = array_append(read_by, auth.uid())
   where dm_id = p_dm
     and sender_id <> auth.uid()
     and not (read_by @> array[auth.uid()]);
end;
$$;

-- ── 3. Event invites ─────────────────────────────────────────────────────

create table if not exists public.event_invites (
  token       text primary key,
  event_id    uuid not null references public.events(id)   on delete cascade,
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists event_invites_event_idx  on public.event_invites (event_id);
create index if not exists event_invites_expires_idx on public.event_invites (expires_at);

alter table public.event_invites enable row level security;
-- No policies: everything routes through the RPCs so an unauthenticated
-- get_event_invite() can safely reveal the event preview without
-- exposing every row of every invite.

-- 12 chars of base62 ≈ 71 bits: enough entropy that a random guess
-- won't hit a live invite, short enough to fit in a shareable link.
create or replace function public.generate_invite_token()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
begin
  for i in 1..12 loop
    result := result || substr(alphabet, floor(random() * 62)::int + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_event_invite(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not (
    exists (select 1 from public.events where id = p_event_id and creator_id = auth.uid())
    or exists (select 1 from public.participants
                where event_id = p_event_id and user_id = auth.uid())
  ) then
    raise exception 'must be host or participant of the event'
      using errcode = '42501';
  end if;
  -- Retry on the astronomically unlikely token collision. Bounded to
  -- keep the RPC from running forever if random() ever misbehaves.
  for i in 1..5 loop
    v_token := public.generate_invite_token();
    exit when not exists (select 1 from public.event_invites where token = v_token);
  end loop;
  -- Comparisons use now() (timestamptz), not timezone('utc', now())
  -- (naive timestamp) so the expiry test is unambiguously in UTC.
  insert into public.event_invites (token, event_id, inviter_id, expires_at)
  values (v_token, p_event_id, auth.uid(), now() + interval '24 hours');
  return v_token;
end;
$$;

-- Anyone with the link can preview it. Deliberately narrow columns:
-- just enough for the accept screen — event title/when/where + the
-- inviter's name — without leaking the whole events row via the
-- invite path (existing events RLS still gates that).
create or replace function public.get_event_invite(p_token text)
returns table (
  event_id             uuid,
  event_title          text,
  event_emoji          text,
  event_date           date,
  event_time           time,
  event_address        text,
  event_image_url      text,
  inviter_display_name text,
  inviter_username     text,
  expires_at           timestamptz,
  expired              boolean
) language sql stable security definer set search_path = public as $$
  select
    e.id, e.title, e.emoji, e.event_date, e.event_time, e.address, e.image_url,
    p.display_name, p.username,
    i.expires_at,
    (i.expires_at < now()) as expired
  from public.event_invites i
  join public.events   e on e.id = i.event_id
  join public.profiles p on p.id = i.inviter_id
  where i.token = p_token;
$$;

create or replace function public.accept_event_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event_id  uuid;
  v_expires   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select event_id, expires_at into v_event_id, v_expires
    from public.event_invites where token = p_token;
  if v_event_id is null then
    raise exception 'invite not found' using errcode = '42704';
  end if;
  if v_expires < now() then
    raise exception 'this invite has expired' using errcode = '42501';
  end if;
  -- The participants join trigger + cap constraint fire from here as
  -- they would on a normal join — a full event still rejects the accept.
  insert into public.participants (event_id, user_id)
  values (v_event_id, auth.uid())
  on conflict (event_id, user_id) do nothing;
  return v_event_id;
end;
$$;

-- ── 4. Realtime + grants ────────────────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end $$;

grant execute on function public.request_friendship(uuid)      to authenticated;
grant execute on function public.remove_friendship(uuid)       to authenticated;
grant execute on function public.get_or_create_dm(uuid)        to authenticated;
grant execute on function public.send_dm(uuid, text)           to authenticated;
grant execute on function public.mark_dm_read(uuid)            to authenticated;
grant execute on function public.create_event_invite(uuid)     to authenticated;
grant execute on function public.get_event_invite(text)        to authenticated;
grant execute on function public.accept_event_invite(text)     to authenticated;
