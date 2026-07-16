-- =========================================================================
-- MapMeet — per-event group chat
-- =========================================================================
-- SCHEMA (Supabase adaptation of the chat spec):
--
--   The chat IS the event. chatId == eventId is guaranteed by keying
--   `messages` on `event_id` directly — there is no separate chats
--   table to drift out of sync. Chat membership == the participants
--   table (host included via auto-join at creation). Host == creator.
--
--   public.messages
--     id          uuid pk
--     event_id    uuid → events(id) cascade        (the "chat id")
--     sender_id   uuid → profiles(id), NULL = system message
--     type        'text' | 'image' | 'video' | 'location' | 'system'
--     text        message body (≤ 2000 chars) / system caption
--     media_url   storage URL for image/video
--     latitude/longitude   for location messages
--     read_by     uuid[] — who has seen it (sender implicit)
--     deleted_for uuid[] — soft "delete for me" (no hard deletes)
--     hidden      bool   — host moderation ("Remove" on any message)
--     created_at  timestamptz (server time)
--
-- ACCESS RULES (spec → RLS):
--   * only chat members (participants or the creator) can read     → SELECT policy
--   * members can only write their own messages                    → INSERT policy (sender_id = auth.uid())
--   * only the host can remove members                             → remove_participant() RPC, host-checked
--   * no hard deletes — soft delete via deleted_for                → no DELETE policy; delete_message_for_me() RPC
--   * read receipts via read_by                                    → mark_messages_read() RPC
--   * system messages can't be forged by clients                   → INSERT policy excludes type='system';
--                                                                    triggers (definer) write them
--
-- SYSTEM MESSAGES (spec's "batch writes" become triggers — atomic
-- with the row change that caused them, no client involvement):
--   * event INSERT            → "<host> created this event"
--   * participants INSERT     → "<name> joined the event"   (skipped for the creator's auto-join)
--   * participants DELETE     → "<name> left the event"  or
--                               "<name> was removed from the event" when
--                               the delete came from remove_participant()
--
-- Realtime: messages added to the supabase_realtime publication.
-- postgres_changes respects RLS, so subscribers only receive rows in
-- chats they belong to.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1. Table -----------------------------------------------------------------

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  sender_id   uuid          references public.profiles(id) on delete set null,
  type        text not null default 'text'
                check (type in ('text', 'image', 'video', 'location', 'system')),
  text        text check (text is null or char_length(text) <= 2000),
  media_url   text,
  latitude    double precision check (latitude  is null or latitude  between -90  and 90),
  longitude   double precision check (longitude is null or longitude between -180 and 180),
  read_by     uuid[] not null default '{}',
  deleted_for uuid[] not null default '{}',
  hidden      boolean not null default false,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists messages_event_created_idx
  on public.messages (event_id, created_at desc);

alter table public.messages enable row level security;

-- 2. Membership helper -----------------------------------------------------
--   definer + stable so RLS policies can call it without recursing into
--   the participants policies.

create or replace function public.is_event_member(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.creator_id = p_user_id
  ) or exists (
    select 1 from public.participants p
    where p.event_id = p_event_id and p.user_id = p_user_id
  );
$$;

-- 3. RLS policies ------------------------------------------------------------

drop policy if exists "members read chat messages"  on public.messages;
create policy "members read chat messages"
  on public.messages for select
  to authenticated
  using (public.is_event_member(event_id, auth.uid()));

-- Clients may only insert their own non-system messages into chats
-- they belong to. System rows come from triggers (definer functions),
-- which bypass RLS.
drop policy if exists "members write own messages" on public.messages;
create policy "members write own messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and type in ('text', 'image', 'video', 'location')
    and public.is_event_member(event_id, auth.uid())
  );

-- No UPDATE / DELETE policies on purpose: reads receipts, soft deletes
-- and moderation all go through the RPCs below; hard deletes are
-- impossible from the client.

-- 4. RPCs --------------------------------------------------------------------

-- Mark everything in a chat as read by the caller.
create or replace function public.mark_messages_read(p_event_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_event_member(p_event_id, auth.uid()) then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;
  update public.messages
     set read_by = array_append(read_by, auth.uid())
   where event_id = p_event_id
     and not (read_by @> array[auth.uid()])
     and (sender_id is null or sender_id <> auth.uid());
end;
$$;

-- Soft "delete for me".
create or replace function public.delete_message_for_me(p_message_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_event uuid;
begin
  select event_id into v_event from public.messages where id = p_message_id;
  if v_event is null or not public.is_event_member(v_event, auth.uid()) then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;
  update public.messages
     set deleted_for = array_append(deleted_for, auth.uid())
   where id = p_message_id
     and not (deleted_for @> array[auth.uid()]);
end;
$$;

-- Host moderation: hide a message for everyone.
create or replace function public.hide_message(p_message_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_host uuid;
begin
  select e.creator_id into v_host
  from public.messages m join public.events e on e.id = m.event_id
  where m.id = p_message_id;
  if v_host is null or v_host <> auth.uid() then
    raise exception 'only the host can remove messages' using errcode = '42501';
  end if;
  update public.messages set hidden = true where id = p_message_id;
end;
$$;

-- Host removes a member from the event (and therefore the chat).
-- Sets a transaction-local flag the participants DELETE trigger reads,
-- so the system message says "removed" instead of "left".
create or replace function public.remove_participant(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_host uuid;
begin
  select creator_id into v_host from public.events where id = p_event_id;
  if v_host is null or v_host <> auth.uid() then
    raise exception 'only the host can remove members' using errcode = '42501';
  end if;
  if p_user_id = v_host then
    raise exception 'the host cannot be removed from their own event';
  end if;
  perform set_config('mapmeet.removed_by_host', '1', true);
  delete from public.participants
   where event_id = p_event_id and user_id = p_user_id;
end;
$$;

-- 5. System-message triggers -------------------------------------------------

create or replace function public.chat_on_event_created()
returns trigger
language plpgsql
security definer
as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.creator_id;
  insert into public.messages (event_id, sender_id, type, text)
  values (new.id, new.creator_id, 'system',
          coalesce(v_name, 'Someone') || ' created this event');
  return new;
end;
$$;

drop trigger if exists chat_event_created on public.events;
create trigger chat_event_created
  after insert on public.events
  for each row execute function public.chat_on_event_created();

create or replace function public.chat_on_participant_joined()
returns trigger
language plpgsql
security definer
as $$
declare
  v_name text;
  v_creator uuid;
begin
  select creator_id into v_creator from public.events where id = new.event_id;
  -- The creator's auto-join right after creation would read as noise
  -- next to "created this event" — skip it.
  if new.user_id = v_creator then
    return new;
  end if;
  select display_name into v_name from public.profiles where id = new.user_id;
  insert into public.messages (event_id, sender_id, type, text)
  values (new.event_id, new.user_id, 'system',
          coalesce(v_name, 'Someone') || ' joined the event');
  return new;
end;
$$;

drop trigger if exists chat_participant_joined on public.participants;
create trigger chat_participant_joined
  after insert on public.participants
  for each row execute function public.chat_on_participant_joined();

create or replace function public.chat_on_participant_left()
returns trigger
language plpgsql
security definer
as $$
declare
  v_name text;
begin
  -- When the whole event is being deleted, participants cascade-delete
  -- while the event row is already gone — inserting a message would
  -- violate the FK. Skip in that case.
  if not exists (select 1 from public.events where id = old.event_id) then
    return old;
  end if;
  select display_name into v_name from public.profiles where id = old.user_id;
  insert into public.messages (event_id, sender_id, type, text)
  values (
    old.event_id, old.user_id, 'system',
    coalesce(v_name, 'Someone') ||
      case when coalesce(current_setting('mapmeet.removed_by_host', true), '') = '1'
        then ' was removed from the event'
        else ' left the event'
      end
  );
  return old;
end;
$$;

drop trigger if exists chat_participant_left on public.participants;
create trigger chat_participant_left
  after delete on public.participants
  for each row execute function public.chat_on_participant_left();

-- 6. Realtime ------------------------------------------------------------------
--   Guarded: `alter publication ... add table` errors if already present.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- 7. Chat media bucket ----------------------------------------------------------
--   `chat-media/<event_id>/<timestamp>_<user_id>.<ext>`. Public read (URLs
--   are unguessable UUIDs); authenticated upload. Media send UI lands in a
--   follow-up — the bucket + policies are ready for it.

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "public read on chat media" on storage.objects;
create policy "public read on chat media"
  on storage.objects for select
  using (bucket_id = 'chat-media');

drop policy if exists "authenticated upload chat media" on storage.objects;
create policy "authenticated upload chat media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-media');
