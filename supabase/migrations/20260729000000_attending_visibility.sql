-- =========================================================================
-- MapMeet — "who can see the events I'm attending?" privacy setting
-- =========================================================================
--   * profiles.attending_visibility — 'nobody' | 'friends' | 'everyone'
--     (default 'everyone'). Controls who may see the list of events the
--     user has JOINED (not hosted — hosted events are already public on
--     the profile).
--   * set_attending_visibility(value)     — update your own setting.
--   * list_attending_event_ids(target)    — the event ids `target` is
--     attending, but ONLY if the caller is allowed by target's setting
--     (self always; friends need is_friend; nobody → empty). Server-side
--     so the gate can't be bypassed by the client.
--
-- Reviews-about-yourself needs no migration: list_user_reviews already
-- anonymises (no author) and doesn't restrict the caller, so a user can
-- read reviews about themselves — the client just wasn't surfacing them.
--
-- Idempotent. Depends on 20260722 (is_friend) + participants/events.
-- =========================================================================

alter table public.profiles
  add column if not exists attending_visibility text not null default 'everyone'
    check (attending_visibility in ('nobody', 'friends', 'everyone'));

create or replace function public.set_attending_visibility(p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_value not in ('nobody', 'friends', 'everyone') then
    raise exception 'invalid visibility value' using errcode = '22023';
  end if;
  update public.profiles set attending_visibility = p_value where id = auth.uid();
end;
$$;

create or replace function public.list_attending_event_ids(p_target uuid)
returns setof uuid language plpgsql security definer stable set search_path = public as $$
declare
  v_vis text;
begin
  if auth.uid() is null then
    return;
  end if;

  select attending_visibility into v_vis from public.profiles where id = p_target;
  v_vis := coalesce(v_vis, 'everyone');

  -- Gate everyone but the owner by the target's setting.
  if p_target <> auth.uid() then
    if v_vis = 'nobody' then
      return;
    end if;
    if v_vis = 'friends' and not public.is_friend(auth.uid(), p_target) then
      return;
    end if;
  end if;

  return query
    select p.event_id
      from public.participants p
      join public.events e on e.id = p.event_id
     where p.user_id = p_target
       and e.creator_id <> p_target; -- hosted events show in the profile's own tabs
end;
$$;

grant execute on function public.set_attending_visibility(text)   to authenticated;
grant execute on function public.list_attending_event_ids(uuid)   to authenticated;
