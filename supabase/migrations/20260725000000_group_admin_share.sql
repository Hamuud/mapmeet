-- =========================================================================
-- MapMeet — group member admin + wider event sharing
-- =========================================================================
-- Two small, related changes:
--
--   1. remove_group_member(group, user) — the group CREATOR can eject a
--      member (mirrors the event chat's host-only remove_participant).
--      Posts a "<name> was removed from the group" system message. The
--      creator can't be removed; self-removal goes through leave_group.
--
--   2. create_event_invite() is relaxed so ANY signed-in user can mint a
--      24h link for a PUBLIC event — that's what powers the "Share"
--      button now shown on every event peek, matching the group flow.
--      PRIVATE events stay host/participant-only (unchanged), so the
--      link can't leak a private event to strangers.
--
-- Adding members already works via add_group_members() (friends-only,
-- any member) from 20260723000000 — no change needed there.
--
-- Idempotent: safe to re-run. Depends on 20260723000000 (group_chats)
-- and 20260722000000 (event_invites).
-- =========================================================================

-- ── 1. Creator-only member removal ───────────────────────────────────────

create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_creator uuid;
  v_name    text;
begin
  select creator_id into v_creator from public.group_chats where id = p_group;
  if v_creator is null then
    raise exception 'group not found' using errcode = '42704';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'only the group creator can remove members'
      using errcode = '42501';
  end if;
  if p_user = v_creator then
    raise exception 'the creator cannot be removed' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group, p_user) then
    return; -- already gone — nothing to do
  end if;

  delete from public.group_members where group_id = p_group and user_id = p_user;

  select display_name into v_name from public.profiles where id = p_user;
  insert into public.group_messages (group_id, sender_id, type, text)
  values (p_group, null, 'system',
          coalesce(v_name, 'Someone') || ' was removed from the group');
end;
$$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- ── 2. Public events are shareable by anyone signed in ───────────────────

create or replace function public.create_event_invite(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token      text;
  v_visibility text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select visibility into v_visibility from public.events where id = p_event_id;
  if v_visibility is null then
    raise exception 'event not found' using errcode = '42704';
  end if;

  -- Private events: still host- or participant-only, so a private event
  -- can't be leaked to strangers. Public events: anyone with the app can
  -- share the link (the recipient still has to accept to join).
  if v_visibility = 'private' and not (
    exists (select 1 from public.events where id = p_event_id and creator_id = auth.uid())
    or exists (select 1 from public.participants
                where event_id = p_event_id and user_id = auth.uid())
  ) then
    raise exception 'must be host or participant to share a private event'
      using errcode = '42501';
  end if;

  -- Retry on the astronomically unlikely token collision.
  for i in 1..5 loop
    v_token := public.generate_invite_token();
    exit when not exists (select 1 from public.event_invites where token = v_token);
  end loop;
  insert into public.event_invites (token, event_id, inviter_id, expires_at)
  values (v_token, p_event_id, auth.uid(), now() + interval '24 hours');
  return v_token;
end;
$$;

grant execute on function public.create_event_invite(uuid) to authenticated;
