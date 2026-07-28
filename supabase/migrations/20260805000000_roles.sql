-- =========================================================================
-- MapMeet — staff roles + clearer restriction errors
-- =========================================================================
-- profiles.role: 'user' | 'support' | 'admin' | 'owner'
--   * owner   — @artem. Everything, and the ONLY role that can assign
--               roles to other people.
--   * admin   — full moderation queue + actions, no role assignment.
--   * support — same moderation access; kept distinct so future
--               permissions can diverge without another migration.
--   * user    — no staff access.
--
-- is_admin() is redefined as "is staff" so every existing RLS policy and
-- RPC keeps working while gaining the new roles. profiles.is_admin stays
-- as a mirror of `role <> 'user'` for the client.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists role text not null default 'user';

do $$ begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('user','support','admin','owner'));
exception when duplicate_object then null; end $$;

-- Seed the owner, then mirror the legacy flag.
update public.profiles set role = 'owner' where lower(username) = 'artem';
update public.profiles set role = 'admin' where is_admin and role = 'user';
update public.profiles set is_admin = (role <> 'user');

create or replace function public.is_owner(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.profiles where id = p_user), false);
$$;

/** Staff = anything above a plain user. Named is_admin for continuity:
 *  the reports RLS policy and every admin_* RPC already call it. */
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role <> 'user' from public.profiles where id = p_user), false);
$$;

/** Owner-only: grant or revoke staff access by username. */
create or replace function public.assign_role(p_username text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_current text;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'only the owner can assign roles' using errcode = '42501';
  end if;
  if p_role not in ('user', 'support', 'admin') then
    raise exception 'unknown role' using errcode = '22023';
  end if;

  select id, role into v_target, v_current
    from public.profiles where lower(username) = lower(btrim(p_username));
  if v_target is null then
    raise exception 'no user with that username' using errcode = '42704';
  end if;
  if v_current = 'owner' then
    raise exception 'the owner role cannot be changed' using errcode = '42501';
  end if;

  update public.profiles
     set role = p_role, is_admin = (p_role <> 'user')
   where id = v_target;

  insert into public.moderation_log (admin_id, target_id, action, detail)
  values (auth.uid(), v_target, 'assign_role', p_role);
end;
$$;

/** Current staff list — visible to any staff member. */
create or replace function public.list_staff()
returns table (id uuid, username text, display_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role
    from public.profiles p
   where p.role <> 'user' and public.is_admin(auth.uid())
   order by case p.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.username;
$$;

-- Staff can't be moderated by other staff; only the owner is untouchable
-- by everyone, and is_admin() now covers support/admin too.
create or replace function public.admin_moderate_user(
  p_user    uuid,
  p_action  text,
  p_minutes integer default null,
  p_report  uuid default null,
  p_note    text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'no target user' using errcode = '23514';
  end if;
  if public.is_admin(p_user) then
    raise exception 'cannot moderate a staff member' using errcode = '42501';
  end if;

  if p_action = 'warn' then
    update public.profiles set warning_count = warning_count + 1 where id = p_user;
  elsif p_action = 'mute' then
    if coalesce(p_minutes, 0) <= 0 then
      raise exception 'mute needs a duration' using errcode = '23514';
    end if;
    update public.profiles
       set muted_until = now() + make_interval(mins => p_minutes) where id = p_user;
  elsif p_action = 'unmute' then
    update public.profiles set muted_until = null where id = p_user;
  elsif p_action = 'ban' then
    update public.profiles set banned_at = now() where id = p_user;
  elsif p_action = 'unban' then
    update public.profiles set banned_at = null, muted_until = null where id = p_user;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;

  insert into public.moderation_log (admin_id, target_id, action, detail, report_id)
  values (auth.uid(), p_user, p_action,
          case when p_action = 'mute' then p_minutes || ' minutes' else nullif(btrim(coalesce(p_note,'')),'') end,
          p_report);
end;
$$;

-- Report the role + mute expiry back to the client. Dropped first: the
-- OUT-parameter list changed, which CREATE OR REPLACE can't do.
drop function if exists public.my_moderation_state();
create or replace function public.my_moderation_state()
returns table (muted_until timestamptz, banned boolean, warnings integer,
               is_admin boolean, role text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select muted_until, banned_at is not null, warning_count,
         role <> 'user', role, role = 'owner'
    from public.profiles where id = auth.uid();
$$;

-- Restriction errors now carry the reason + when it lifts, so even a
-- server-side rejection can be explained rather than showing a raw code.
create or replace function public.enforce_can_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_muted timestamptz; v_banned timestamptz;
begin
  if tg_table_name = 'events' then
    v_actor := new.creator_id;
  elsif tg_table_name = 'user_reviews' then
    v_actor := new.author_id;
  else
    v_actor := new.sender_id;
  end if;
  if v_actor is null then
    return new;
  end if;

  select muted_until, banned_at into v_muted, v_banned
    from public.profiles where id = v_actor;

  if v_banned is not null then
    raise exception 'ACCOUNT_BANNED' using errcode = '42501';
  end if;
  if v_muted is not null and v_muted > now() then
    raise exception 'ACCOUNT_MUTED_UNTIL %', to_char(v_muted at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

grant execute on function public.is_owner(uuid)             to authenticated;
grant execute on function public.assign_role(text, text)    to authenticated;
grant execute on function public.list_staff()               to authenticated;
