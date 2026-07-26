-- =========================================================================
-- MapMeet — polls in DMs + auto "Who's coming?" poll
-- =========================================================================
-- Extends the polls feature (20260726) so it works identically across
-- event, group AND direct-message chats, and adds a one-time automatic
-- "Who's coming?" poll an hour before an event starts.
--
--   * dm_messages gains the 'poll' type + poll jsonb (parity with the
--     other two message tables).
--   * create_dm_poll — post a poll in a DM (same 1-message cold rule as
--     send_dm for non-friends).
--   * vote_poll / get_poll_details — CREATE OR REPLACE to also look in
--     dm_messages, so voting + who-voted work in DMs too.
--   * events.coming_poll_created — one-shot flag, mirrors archive_warned.
--   * ensure_coming_poll — member-triggered (like post_archive_warning):
--     the hour before start, posts a non-anonymous "Who's coming?" poll
--     with "+" / "-" options exactly once.
--
-- Idempotent. Depends on 20260726 (polls) + 20260722/24 (dms).
-- =========================================================================

-- ── DM schema parity ─────────────────────────────────────────────────────

alter table public.dm_messages drop constraint if exists dm_messages_type_check;
alter table public.dm_messages add constraint dm_messages_type_check
  check (type in ('text', 'invite', 'audio', 'poll'));

alter table public.dm_messages add column if not exists poll jsonb;

alter table public.events add column if not exists coming_poll_created boolean not null default false;

-- ── Create a poll in a DM ────────────────────────────────────────────────

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
  -- Same cold-start rule as a text/voice DM: a non-friend gets one message.
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

-- ── Vote (now spans event / group / dm) ──────────────────────────────────

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

  select 'event', event_id, poll into v_chat_type, v_chat_id, v_poll
    from public.messages where id = p_message_id and type = 'poll';
  if v_chat_type is null then
    select 'group', group_id, poll into v_chat_type, v_chat_id, v_poll
      from public.group_messages where id = p_message_id and type = 'poll';
  end if;
  if v_chat_type is null then
    select 'dm', dm_id, poll into v_chat_type, v_chat_id, v_poll
      from public.dm_messages where id = p_message_id and type = 'poll';
  end if;
  if v_chat_type is null then
    raise exception 'poll not found' using errcode = '42704';
  end if;

  if v_chat_type = 'event' then
    v_member := exists (select 1 from public.events where id = v_chat_id and creator_id = auth.uid())
             or exists (select 1 from public.participants where event_id = v_chat_id and user_id = auth.uid());
  elsif v_chat_type = 'group' then
    v_member := public.is_group_member(v_chat_id, auth.uid());
  else
    v_member := public.is_dm_member(v_chat_id, auth.uid());
  end if;
  if not v_member then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_poll->'options') o where o->>'id' = p_option_id
  ) then
    raise exception 'invalid option' using errcode = '22023';
  end if;

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

  for v_opt in select * from jsonb_array_elements(v_poll->'options') loop
    select count(*) into v_cnt from public.poll_votes
      where message_id = p_message_id and option_id = (v_opt->>'id');
    v_new_opts := v_new_opts || jsonb_build_object(
      'id', v_opt->>'id', 'text', v_opt->>'text', 'votes', v_cnt);
  end loop;
  v_poll := jsonb_set(v_poll, '{options}', v_new_opts);

  if v_chat_type = 'event' then
    update public.messages set poll = v_poll where id = p_message_id;
  elsif v_chat_type = 'group' then
    update public.group_messages set poll = v_poll where id = p_message_id;
  else
    update public.dm_messages set poll = v_poll where id = p_message_id;
  end if;
end;
$$;

-- Allow chat_type = 'dm' now that DMs carry polls.
alter table public.poll_votes drop constraint if exists poll_votes_chat_type_check;
alter table public.poll_votes add constraint poll_votes_chat_type_check
  check (chat_type in ('event', 'group', 'dm'));

-- ── Details / who-voted (now spans event / group / dm) ───────────────────

create or replace function public.get_poll_details(p_message_ids uuid[])
returns table (message_id uuid, my_option text, voters jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with polls as (
    select m.id, coalesce((m.poll->>'anonymous')::boolean, false) as anon,
           m.event_id as chat_id, 'event'::text as ctype
      from public.messages m where m.id = any(p_message_ids) and m.type = 'poll'
    union all
    select g.id, coalesce((g.poll->>'anonymous')::boolean, false),
           g.group_id, 'group'
      from public.group_messages g where g.id = any(p_message_ids) and g.type = 'poll'
    union all
    select d.id, coalesce((d.poll->>'anonymous')::boolean, false),
           d.dm_id, 'dm'
      from public.dm_messages d where d.id = any(p_message_ids) and d.type = 'poll'
  ),
  mine as (
    select pv.message_id, pv.option_id
      from public.poll_votes pv
     where pv.user_id = auth.uid() and pv.message_id = any(p_message_ids)
  ),
  vis as (
    select pv.message_id, pv.option_id,
           jsonb_build_object(
             'id', pr.id, 'username', pr.username,
             'display_name', pr.display_name, 'avatar_url', pr.avatar_url) as prof
      from public.poll_votes pv
      join polls p            on p.id = pv.message_id and p.anon = false
      join public.profiles pr on pr.id = pv.user_id
     where (
       (p.ctype = 'event' and (
          exists (select 1 from public.events e where e.id = p.chat_id and e.creator_id = auth.uid())
          or exists (select 1 from public.participants pt where pt.event_id = p.chat_id and pt.user_id = auth.uid())))
       or (p.ctype = 'group' and public.is_group_member(p.chat_id, auth.uid()))
       or (p.ctype = 'dm' and public.is_dm_member(p.chat_id, auth.uid()))
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

-- ── Auto "Who's coming?" poll, an hour before start ──────────────────────

create or replace function public.ensure_coming_poll(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rows integer := 0;
begin
  if not public.is_event_member(p_event_id, auth.uid()) then
    raise exception 'not a member of this chat' using errcode = '42501';
  end if;

  -- One-shot: only the caller that flips the flag posts the poll.
  update public.events
     set coming_poll_created = true
   where id = p_event_id and coming_poll_created = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;
  end if;

  -- System-authored (sender null), non-anonymous, simple +/- choices.
  insert into public.messages (event_id, sender_id, type, text, poll)
  values (
    p_event_id, null, 'poll', 'Who''s coming?',
    jsonb_build_object(
      'question', 'Who''s coming?',
      'anonymous', false,
      'options', jsonb_build_array(
        jsonb_build_object('id', '1', 'text', '+', 'votes', 0),
        jsonb_build_object('id', '2', 'text', '-', 'votes', 0)
      )
    )
  );
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function public.create_dm_poll(uuid, text, text[], boolean, uuid) to authenticated;
grant execute on function public.vote_poll(uuid, text)                              to authenticated;
grant execute on function public.get_poll_details(uuid[])                           to authenticated;
grant execute on function public.ensure_coming_poll(uuid)                           to authenticated;
