-- =========================================================================
-- MapMeet — blocking also unfriends; friend requests blocked while blocked
-- =========================================================================
--   * block_user now also removes any friendship between the two (both
--     directions), so a blocked user drops off both friends lists. Unblock
--     doesn't restore it — they have to send a fresh friend request.
--   * request_friendship rejects while a block is active either way, so
--     you can't re-friend without unblocking first.
--
-- Avatar / last-seen hiding for the blocked user is done client-side from
-- the block state the DM + profile screens already load.
--
-- Idempotent. Depends on 20260722 (friendships) + 20260730 (blocks).
-- =========================================================================

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

  if found then
    -- Drop the friendship from both lists.
    delete from public.friendships
     where (requester_id = auth.uid() and recipient_id = p_target)
        or (requester_id = p_target and recipient_id = auth.uid());

    -- Post the notice the blocked user sees in the DM.
    v_dm := public.get_or_create_dm(p_target);
    insert into public.dm_messages (dm_id, sender_id, type, text)
    values (v_dm, null, 'system', 'You have been blocked by a user');
  end if;
end;
$$;

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
  -- Can't (re)friend while a block is active either way.
  if public.dm_block_active(auth.uid(), p_target) then
    raise exception 'unblock this user before adding them' using errcode = '42501';
  end if;

  select * into v_row from public.friendships
    where (requester_id = auth.uid() and recipient_id = p_target)
       or (requester_id = p_target and recipient_id = auth.uid())
    limit 1;

  if v_row.id is not null then
    if v_row.status = 'accepted' then
      return v_row.id;
    end if;
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

grant execute on function public.block_user(uuid)         to authenticated;
grant execute on function public.request_friendship(uuid) to authenticated;
