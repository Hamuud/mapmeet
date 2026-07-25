-- =========================================================================
-- MapMeet — polls in event + group chats
-- =========================================================================
-- A poll is a message of type 'poll'. Its definition + aggregate vote
-- counts live in a `poll` jsonb column on the message row:
--
--   { "question": text,
--     "anonymous": bool,
--     "options": [ { "id": "1", "text": "…", "votes": <int count> }, … ] }
--
-- Individual votes live in a separate, PRIVATE `poll_votes` table (one
-- row per voter per poll — single choice). Clients never read it: it is
-- reached only through security-definer RPCs, so an "anonymous" poll
-- genuinely hides who voted (the message row exposes counts only).
--
--   * create_event_poll / create_group_poll — post a poll (members only)
--   * vote_poll(message, option)            — cast / change / retract a vote
--   * get_poll_details(message_ids[])       — the caller's own choice for
--       every poll, plus per-option voter profiles for NON-anonymous polls
--       the caller can see (drives the avatar row); anonymous → no voters.
--
-- Voting recomputes the counts into the message's `poll` jsonb and writes
-- the row back, so the existing message realtime subscription fires and
-- every client refreshes the tallies live.
--
-- Idempotent. Depends on 20260717 (messages) + 20260723 (group_chats).
-- =========================================================================

-- ── Schema: allow the 'poll' type + carry the poll payload ───────────────

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'image', 'video', 'location', 'audio', 'system', 'poll'));

alter table public.group_messages drop constraint if exists group_messages_type_check;
alter table public.group_messages add constraint group_messages_type_check
  check (type in ('text', 'audio', 'system', 'poll'));

alter table public.messages       add column if not exists poll jsonb;
alter table public.group_messages add column if not exists poll jsonb;

-- ── Private per-voter table ──────────────────────────────────────────────

create table if not exists public.poll_votes (
  message_id uuid not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  option_id  text not null,
  chat_type  text not null check (chat_type in ('event', 'group')),
  chat_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists poll_votes_message_idx on public.poll_votes (message_id);

-- RLS on, no policies: the table is reachable only through the
-- security-definer RPCs below. That's what makes anonymity real —
-- no client can SELECT the raw votes.
alter table public.poll_votes enable row level security;

-- ── Helpers ──────────────────────────────────────────────────────────────

-- Build the options jsonb from a text[] of choices: trims, drops blanks,
-- assigns stable 1-based ids, seeds every count at 0.
create or replace function public.poll_build_options(p_options text[])
returns jsonb language plpgsql immutable as $$
declare
  v_opts jsonb := '[]'::jsonb;
  v_t    text;
  v_i    int := 0;
begin
  foreach v_t in array coalesce(p_options, '{}') loop
    if char_length(btrim(v_t)) > 0 then
      v_i := v_i + 1;
      v_opts := v_opts || jsonb_build_object('id', v_i::text, 'text', btrim(v_t), 'votes', 0);
    end if;
  end loop;
  return v_opts;
end;
$$;

-- ── Create ───────────────────────────────────────────────────────────────

create or replace function public.create_event_poll(
  p_event_id  uuid,
  p_question  text,
  p_options   text[],
  p_anonymous boolean default false,
  p_reply_to  uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_q    text := btrim(coalesce(p_question, ''));
  v_opts jsonb := public.poll_build_options(p_options);
begin
  if not (
    exists (select 1 from public.events where id = p_event_id and creator_id = auth.uid())
    or exists (select 1 from public.participants where event_id = p_event_id and user_id = auth.uid())
  ) then
    raise exception 'must be a participant to post a poll' using errcode = '42501';
  end if;
  if char_length(v_q) < 1 then
    raise exception 'poll needs a question' using errcode = '23514';
  end if;
  if jsonb_array_length(v_opts) < 2 then
    raise exception 'poll needs at least 2 options' using errcode = '23514';
  end if;

  insert into public.messages (event_id, sender_id, type, text, reply_to, poll)
  values (p_event_id, auth.uid(), 'poll', v_q, p_reply_to,
          jsonb_build_object('question', v_q, 'anonymous', coalesce(p_anonymous, false), 'options', v_opts))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_group_poll(
  p_group     uuid,
  p_question  text,
  p_options   text[],
  p_anonymous boolean default false,
  p_reply_to  uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_q    text := btrim(coalesce(p_question, ''));
  v_opts jsonb := public.poll_build_options(p_options);
begin
  if not public.is_group_member(p_group, auth.uid()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if char_length(v_q) < 1 then
    raise exception 'poll needs a question' using errcode = '23514';
  end if;
  if jsonb_array_length(v_opts) < 2 then
    raise exception 'poll needs at least 2 options' using errcode = '23514';
  end if;

  insert into public.group_messages (group_id, sender_id, type, text, reply_to, poll)
  values (p_group, auth.uid(), 'poll', v_q, p_reply_to,
          jsonb_build_object('question', v_q, 'anonymous', coalesce(p_anonymous, false), 'options', v_opts))
  returning id into v_id;
  update public.group_chats set updated_at = timezone('utc', now()) where id = p_group;
  return v_id;
end;
$$;

-- ── Vote (cast / change / retract) ───────────────────────────────────────

create or replace function public.vote_poll(p_message_id uuid, p_option_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chat_type text;
  v_chat_id   uuid;
  v_poll      jsonb;
  v_member    boolean;
  v_existing  text;
  v_opt       jsonb;
  v_new_opts  jsonb := '[]'::jsonb;
  v_cnt       int;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Locate the poll across the event + group message tables.
  select 'event', event_id, poll into v_chat_type, v_chat_id, v_poll
    from public.messages where id = p_message_id and type = 'poll';
  if v_chat_type is null then
    select 'group', group_id, poll into v_chat_type, v_chat_id, v_poll
      from public.group_messages where id = p_message_id and type = 'poll';
  end if;
  if v_chat_type is null then
    raise exception 'poll not found' using errcode = '42704';
  end if;

  -- Membership check for the chat that owns the poll.
  if v_chat_type = 'event' then
    v_member := exists (select 1 from public.events where id = v_chat_id and creator_id = auth.uid())
             or exists (select 1 from public.participants where event_id = v_chat_id and user_id = auth.uid());
  else
    v_member := public.is_group_member(v_chat_id, auth.uid());
  end if;
  if not v_member then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;

  -- The option must exist on the poll.
  if not exists (
    select 1 from jsonb_array_elements(v_poll->'options') o where o->>'id' = p_option_id
  ) then
    raise exception 'invalid option' using errcode = '22023';
  end if;

  -- Tap the option you already picked → retract; otherwise (re)cast.
  select option_id into v_existing from public.poll_votes
    where message_id = p_message_id and user_id = auth.uid();
  if v_existing is not distinct from p_option_id then
    delete from public.poll_votes where message_id = p_message_id and user_id = auth.uid();
  else
    insert into public.poll_votes (message_id, user_id, option_id, chat_type, chat_id)
    values (p_message_id, auth.uid(), p_option_id, v_chat_type, v_chat_id)
    on conflict (message_id, user_id)
      do update set option_id = excluded.option_id, created_at = now();
  end if;

  -- Recompute per-option counts back into the poll jsonb.
  for v_opt in select * from jsonb_array_elements(v_poll->'options') loop
    select count(*) into v_cnt from public.poll_votes
      where message_id = p_message_id and option_id = (v_opt->>'id');
    v_new_opts := v_new_opts || jsonb_build_object(
      'id', v_opt->>'id', 'text', v_opt->>'text', 'votes', v_cnt);
  end loop;
  v_poll := jsonb_set(v_poll, '{options}', v_new_opts);

  if v_chat_type = 'event' then
    update public.messages set poll = v_poll where id = p_message_id;
  else
    update public.group_messages set poll = v_poll where id = p_message_id;
  end if;
end;
$$;

-- ── Read: my choice + (public polls only) voter avatars ──────────────────

create or replace function public.get_poll_details(p_message_ids uuid[])
returns table (message_id uuid, my_option text, voters jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with polls as (
    select m.id,
           coalesce((m.poll->>'anonymous')::boolean, false) as anon,
           m.event_id as chat_id,
           'event'::text as ctype
      from public.messages m
     where m.id = any(p_message_ids) and m.type = 'poll'
    union all
    select g.id,
           coalesce((g.poll->>'anonymous')::boolean, false),
           g.group_id,
           'group'
      from public.group_messages g
     where g.id = any(p_message_ids) and g.type = 'poll'
  ),
  mine as (
    select pv.message_id, pv.option_id
      from public.poll_votes pv
     where pv.user_id = auth.uid() and pv.message_id = any(p_message_ids)
  ),
  vis as (
    -- Voters, but only for non-anonymous polls the caller belongs to.
    select pv.message_id, pv.option_id,
           jsonb_build_object(
             'id', pr.id, 'username', pr.username,
             'display_name', pr.display_name, 'avatar_url', pr.avatar_url) as prof
      from public.poll_votes pv
      join polls p       on p.id = pv.message_id and p.anon = false
      join public.profiles pr on pr.id = pv.user_id
     where (
       (p.ctype = 'event' and (
          exists (select 1 from public.events e where e.id = p.chat_id and e.creator_id = auth.uid())
          or exists (select 1 from public.participants pt where pt.event_id = p.chat_id and pt.user_id = auth.uid())))
       or (p.ctype = 'group' and public.is_group_member(p.chat_id, auth.uid()))
     )
  ),
  per_option as (
    select vis.message_id, vis.option_id, jsonb_agg(vis.prof) as profs
      from vis group by vis.message_id, vis.option_id
  ),
  grouped as (
    select per_option.message_id,
           jsonb_object_agg(per_option.option_id, per_option.profs) as voters
      from per_option group by per_option.message_id
  )
  select p.id, mine.option_id, grouped.voters
    from polls p
    left join mine    on mine.message_id = p.id
    left join grouped on grouped.message_id = p.id;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function public.create_event_poll(uuid, text, text[], boolean, uuid) to authenticated;
grant execute on function public.create_group_poll(uuid, text, text[], boolean, uuid) to authenticated;
grant execute on function public.vote_poll(uuid, text)                                to authenticated;
grant execute on function public.get_poll_details(uuid[])                             to authenticated;
