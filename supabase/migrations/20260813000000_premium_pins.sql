-- =========================================================================
-- MapMeet — the `premium` role + styled event pins
-- =========================================================================
-- profiles.role gains a fifth value: 'premium'.
--
--   owner   — @artem. Everything, and the only role that can hand out
--             staff roles.
--   admin   — moderation queue + actions, and may grant/revoke premium.
--   support — moderation queue + actions.
--   premium — NOT staff. One perk today: a coloured, optionally animated
--             pin on the map. Granted by an admin now; by the billing
--             webhook once subscriptions exist.
--   user    — the default.
--
-- ⚠ The load-bearing change in this file is is_admin(). It was defined as
--   `role <> 'user'`, which every RLS policy and admin_* RPC leans on.
--   Adding 'premium' under that definition would have handed the whole
--   moderation surface — the reports queue, ban/mute, other people's
--   private data — to every paying customer. It is now an explicit staff
--   list, and the profiles.is_admin mirror column is re-derived to match.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The role itself
-- -------------------------------------------------------------------------
do $$ begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user','premium','support','admin','owner'));
end $$;

/** Staff = moderation powers. Explicit list, NOT `<> 'user'` — see the
 *  header. Still named is_admin because the policies and RPCs written
 *  against it predate the role column and there is no value in churning
 *  every call site. */
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('support','admin','owner') from public.profiles where id = p_user),
    false);
$$;

-- Re-derive the mirror column under the new definition. A premium user
-- who was mid-flight when this ran must not keep is_admin = true.
update public.profiles set is_admin = (role in ('support','admin','owner'))
 where is_admin <> (role in ('support','admin','owner'));

/** Entitled to style their pins. Premium plus everyone above it —
 *  staff get the perk for free, which is also how we dogfood it. */
create or replace function public.can_style_pin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('premium','support','admin','owner')
       from public.profiles where id = p_user),
    false);
$$;

-- -------------------------------------------------------------------------
-- 2. Who may grant what
-- -------------------------------------------------------------------------
-- Owner  → any role, on anyone but the owner.
-- Admin  → premium only, and may revoke it; cannot touch a staff member,
--          so an admin can neither promote themselves nor demote support.
-- Others → nothing.
--
-- Revocation is `p_role = 'user'`, which is why the admin branch has to
-- check what the target currently holds rather than only what is asked
-- for: "set @someone to user" is a demotion when that someone is support.
create or replace function public.assign_role(p_username text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target  uuid;
  v_current text;
  v_owner   boolean := public.is_owner(auth.uid());
  v_admin   boolean := coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()), false);
begin
  if not (v_owner or v_admin) then
    raise exception 'only an admin or the owner can assign roles' using errcode = '42501';
  end if;
  if p_role not in ('user', 'premium', 'support', 'admin') then
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

  if not v_owner then
    if p_role in ('support', 'admin') then
      raise exception 'only the owner can assign staff roles' using errcode = '42501';
    end if;
    if v_current in ('support', 'admin') then
      raise exception 'only the owner can change a staff member''s role' using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set role = p_role, is_admin = (p_role in ('support','admin','owner'))
   where id = v_target;

  insert into public.moderation_log (admin_id, target_id, action, detail)
  values (auth.uid(), v_target, 'assign_role', p_role);
end;
$$;

-- list_staff() needs no change: its `role <> 'user'` filter now also
-- picks up premium members, which is exactly what the Roles panel wants
-- to show. Only the ordering is refreshed so premium sorts below staff.
create or replace function public.list_staff()
returns table (id uuid, username text, display_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role
    from public.profiles p
   where p.role <> 'user' and public.is_admin(auth.uid())
   order by case p.role
              when 'owner' then 0 when 'admin' then 1
              when 'support' then 2 else 3 end,
            p.username;
$$;

-- -------------------------------------------------------------------------
-- 3. The pin style itself
-- -------------------------------------------------------------------------
-- Colours are stored as palette KEYS, not hex. Three reasons: a free hex
-- field produces pins that vanish against satellite imagery, it lets
-- anyone imitate the colours that already mean something (ink = the
-- selected pin, coral = the pin you are currently placing), and keys let
-- the palette be re-tuned later without rewriting rows. Coral itself is
-- deliberately absent from the list for that second reason.
alter table public.events
  add column if not exists pin_color  text,
  add column if not exists pin_effect text;

do $$ begin
  alter table public.events drop constraint if exists events_pin_color_check;
  alter table public.events
    add constraint events_pin_color_check
    check (pin_color is null or pin_color in
      ('rose','amber','lime','teal','sky','indigo','violet','magenta'));

  alter table public.events drop constraint if exists events_pin_effect_check;
  alter table public.events
    add constraint events_pin_effect_check
    check (pin_effect is null or pin_effect in ('none','glow','stars','shine'));
end $$;

/** Coerce, don't reject.
 *
 *  RLS lets people insert their own events, so nothing stops a crafted
 *  request from setting pin_color without the entitlement — this is the
 *  check that matters. It silently drops the style instead of raising,
 *  because the failure mode of raising is worse than the failure mode of
 *  ignoring: premium lapses, and that user must still be able to edit
 *  the title of an event they already styled. On update we carry the old
 *  values forward, so a lapsed subscriber keeps what they had and simply
 *  cannot change it.
 *
 *  Rendering is gated separately, on the creator's CURRENT role, so a
 *  revoked premium's pins go back to standard on everyone's map while
 *  the stored choice waits for them to resubscribe. */
create or replace function public.enforce_pin_style()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.can_style_pin(new.creator_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pin_color  := null;
    new.pin_effect := null;
  else
    new.pin_color  := old.pin_color;
    new.pin_effect := old.pin_effect;
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_pin_style on public.events;
create trigger events_enforce_pin_style
  before insert or update on public.events
  for each row execute function public.enforce_pin_style();

grant execute on function public.can_style_pin(uuid) to authenticated;
