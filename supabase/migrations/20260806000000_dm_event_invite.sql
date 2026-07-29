-- =========================================================================
-- MapMeet — send an event invite straight into a DM
-- =========================================================================
-- dm_messages already carries type='invite' + event_invite_token, but
-- nothing could create one: invites could only be shared as a link. This
-- adds the send path so an event can be handed to a friend in-app, and
-- they accept from the message.
--
-- Same gates as any other DM: block list either way, and the
-- one-message cold-start rule for non-friends.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create or replace function public.send_dm_invite(
  p_recipient uuid,
  p_token     text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_dm_id  uuid;
  v_msg_id uuid;
  v_event  uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.dm_block_active(auth.uid(), p_recipient) then
    raise exception 'you can''t message this user' using errcode = '42501';
  end if;

  -- The token must be a real, unexpired invite.
  select event_id, expires_at into v_event, v_expires
    from public.event_invites where token = p_token;
  if v_event is null then
    raise exception 'invite not found' using errcode = '42704';
  end if;
  if v_expires < now() then
    raise exception 'this invite has expired' using errcode = '42501';
  end if;

  v_dm_id := public.get_or_create_dm(p_recipient);
  if not public.dm_cold_ok(v_dm_id, p_recipient) then
    raise exception 'add them as a friend to send more messages' using errcode = '42501';
  end if;

  insert into public.dm_messages (dm_id, sender_id, type, event_invite_token)
  values (v_dm_id, auth.uid(), 'invite', p_token)
  returning id into v_msg_id;
  return v_msg_id;
end;
$$;

grant execute on function public.send_dm_invite(uuid, text) to authenticated;
