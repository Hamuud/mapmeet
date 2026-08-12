-- =========================================================================
-- MapMeet — the `designer` role ("Adriana Designer")
-- =========================================================================
-- A sixth value on profiles.role. Unlike 'premium' this one IS staff: it
-- carries the same moderation access as 'admin'. On top of that it is the
-- only tier (besides the owner) allowed to go off the fixed palette:
--
--   * any #RRGGBB for the pin colour, not just the eight named keys;
--   * its own emoji as the falling particles, instead of the ✦ sparkle.
--
-- Two structural notes:
--
-- 1. The staff list is now a function, `staff_roles()`, instead of an
--    inline literal repeated in five places. Adding 'premium' last time
--    meant auditing every one of them by hand to make sure a paying
--    customer didn't become a moderator; this is the fix so the next
--    role is a one-line change.
--
-- 2. pin_color keeps a single column. It holds either a palette key or a
--    literal '#RRGGBB', and the trigger — not the CHECK — is what decides
--    who may store the latter. The CHECK cannot see auth.uid().
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Role membership, in one place each
-- -------------------------------------------------------------------------
/** Everything with moderation powers. THE list — is_admin() and every
 *  mirror derive from it, so a new staff tier is added here and nowhere
 *  else. Note what is absent: 'premium' is a paid cosmetic tier. */
create or replace function public.staff_roles()
returns text[] language sql immutable as $$
  select array['designer','support','admin','owner']::text[];
$$;

/** Everything entitled to a styled pin: the paid tier plus all staff. */
create or replace function public.pin_style_roles()
returns text[] language sql immutable as $$
  select array['premium'] || public.staff_roles();
$$;

/** Everything allowed off the fixed palette — free hex and custom
 *  falling emoji. The designer tier is the point of this migration; the
 *  owner is included because they administer the app and cannot hold a
 *  second role alongside 'owner'. */
create or replace function public.freeform_style_roles()
returns text[] language sql immutable as $$
  select array['designer','owner']::text[];
$$;

do $$ begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user','premium','designer','support','admin','owner'));
end $$;

create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = any(public.staff_roles()) from public.profiles where id = p_user),
    false);
$$;

create or replace function public.can_style_pin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = any(public.pin_style_roles()) from public.profiles where id = p_user),
    false);
$$;

create or replace function public.can_style_pin_freeform(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = any(public.freeform_style_roles()) from public.profiles where id = p_user),
    false);
$$;

-- Re-derive the mirror column under the widened staff list.
update public.profiles set is_admin = (role = any(public.staff_roles()))
 where is_admin <> (role = any(public.staff_roles()));

-- -------------------------------------------------------------------------
-- 2. Granting it
-- -------------------------------------------------------------------------
-- 'designer' carries moderation access, so it lands on the owner-only
-- side of the split: an admin can still only move people in and out of
-- premium, and now cannot demote a designer either (that check reads
-- staff_roles(), so it widened automatically).
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
  if p_role not in ('user', 'premium', 'designer', 'support', 'admin') then
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
    if p_role = any(public.staff_roles()) then
      raise exception 'only the owner can assign staff roles' using errcode = '42501';
    end if;
    if v_current = any(public.staff_roles()) then
      raise exception 'only the owner can change a staff member''s role' using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set role = p_role, is_admin = (p_role = any(public.staff_roles()))
   where id = v_target;

  insert into public.moderation_log (admin_id, target_id, action, detail)
  values (auth.uid(), v_target, 'assign_role', p_role);
end;
$$;

create or replace function public.list_staff()
returns table (id uuid, username text, display_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role
    from public.profiles p
   where p.role <> 'user' and public.is_admin(auth.uid())
   order by case p.role
              when 'owner' then 0 when 'admin' then 1
              when 'designer' then 2 when 'support' then 3 else 4 end,
            p.username;
$$;

-- -------------------------------------------------------------------------
-- 3. Free hex + custom falling emoji
-- -------------------------------------------------------------------------
-- The falling particles. An array rather than one packed string: emoji
-- are grapheme clusters, and splitting '👽🌸' back apart in JS without
-- mangling ZWJ sequences is a trap we can avoid entirely by never
-- joining them in the first place. Up to three — the effect draws three
-- particles, and a shorter list cycles.
alter table public.events
  add column if not exists pin_effect_emoji text[];

do $$ begin
  -- Palette key OR a literal #RRGGBB. Which of the two an account may
  -- actually store is decided by enforce_pin_style(), because a CHECK
  -- constraint cannot see who is writing the row.
  alter table public.events drop constraint if exists events_pin_color_check;
  alter table public.events
    add constraint events_pin_color_check
    check (pin_color is null
           or pin_color in ('rose','amber','lime','teal','sky','indigo','violet','magenta')
           or pin_color ~ '^#[0-9A-Fa-f]{6}$');

  -- No subqueries allowed in a CHECK, so the per-element length bound is
  -- expressed against the concatenation: three clusters of up to 16
  -- chars each is 48.
  alter table public.events drop constraint if exists events_pin_effect_emoji_check;
  alter table public.events
    add constraint events_pin_effect_emoji_check
    check (pin_effect_emoji is null
           or (array_length(pin_effect_emoji, 1) between 1 and 3
               and not ('' = any(pin_effect_emoji))
               and char_length(array_to_string(pin_effect_emoji, '')) <= 48));
end $$;

/** Coerce, don't reject — see the premium migration for why.
 *
 *  Two tiers now. Losing `can_style_pin` drops the lot; holding it but
 *  not `can_style_pin_freeform` keeps the named palette and the ✦
 *  sparkles but not a raw hex or custom glyphs. In both cases an UPDATE
 *  carries the old values forward rather than erroring, so somebody who
 *  has been demoted can still edit the title of an event they styled
 *  while they held the role. */
create or replace function public.enforce_pin_style()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_insert boolean := (tg_op = 'INSERT');
begin
  if not public.can_style_pin(new.creator_id) then
    new.pin_color        := case when v_insert then null else old.pin_color end;
    new.pin_effect       := case when v_insert then null else old.pin_effect end;
    new.pin_effect_emoji := case when v_insert then null else old.pin_effect_emoji end;
    return new;
  end if;

  if not public.can_style_pin_freeform(new.creator_id) then
    if new.pin_color is not null and left(new.pin_color, 1) = '#' then
      new.pin_color := case when v_insert then null else old.pin_color end;
    end if;
    if new.pin_effect_emoji is not null then
      new.pin_effect_emoji := case when v_insert then null else old.pin_effect_emoji end;
    end if;
  end if;

  -- Custom glyphs only mean anything under the falling-particles effect;
  -- storing them alongside 'glow' would resurface if the effect were
  -- later switched back, which is surprising rather than useful.
  if coalesce(new.pin_effect, 'none') <> 'stars' then
    new.pin_effect_emoji := null;
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_pin_style on public.events;
create trigger events_enforce_pin_style
  before insert or update on public.events
  for each row execute function public.enforce_pin_style();

grant execute on function public.staff_roles()                     to authenticated;
grant execute on function public.pin_style_roles()                 to authenticated;
grant execute on function public.freeform_style_roles()            to authenticated;
grant execute on function public.can_style_pin_freeform(uuid)      to authenticated;
