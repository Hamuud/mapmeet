-- MapMeet — how old is the person arranging to meet a stranger?
--
-- Nothing in the schema knew. An app that puts people in a room together
-- has to know it isn't putting children there, and the store age rating
-- has to be a fact rather than a hope.
--
-- The date of birth deliberately does NOT live on `profiles`. That table
-- is readable by everyone — `using (true)` — because the app shows other
-- people's names, avatars and bios. A column there is a column the whole
-- internet can select, and a birthday is the classic identity-theft
-- half-answer. So it lives in its own table, readable only by its owner,
-- writable only through a function that enforces the floor.

/** The youngest MapMeet will accept. Mirrored in utils/validators.ts so
 *  the form can say so before the round trip; this is the copy that
 *  actually decides. */
create or replace function public.min_signup_age() returns int
  language sql immutable as $$ select 16 $$;

create table if not exists public.user_ages (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  updated_at timestamptz not null default now()
);

alter table public.user_ages enable row level security;

-- Own row, and only own row — there is no "friends can see" tier here on
-- purpose. Nobody needs another user's birthday.
drop policy if exists "read own date of birth" on public.user_ages;
create policy "read own date of birth" on public.user_ages
  for select using (auth.uid() = user_id);

-- No INSERT or UPDATE policy, and no table grants: every write goes
-- through set_date_of_birth() so the age floor cannot be bypassed by
-- talking to PostgREST directly.
revoke all on public.user_ages from authenticated, anon;
grant select on public.user_ages to authenticated;

-- A public, harmless boolean so the app can tell whether to ask, without
-- a second request and without exposing the date. Not client-writable:
-- the column grants from 20260815000000 list what `authenticated` may
-- update, and this is not on the list.
alter table public.profiles
  add column if not exists age_confirmed boolean not null default false;

/** Record it, once or again if they mistyped. Raises on anyone too young,
 *  with a message the client shows verbatim. */
create or replace function public.set_date_of_birth(p_dob date)
returns void language plpgsql security definer set search_path = public as $$
declare v_age int;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_dob is null or p_dob > current_date then
    raise exception 'That date of birth is not valid.' using errcode = '22023';
  end if;

  -- age() rather than subtracting years: it gets leap years and the
  -- "birthday hasn't happened yet this year" case right.
  v_age := extract(year from age(current_date, p_dob));

  if v_age > 120 then
    raise exception 'That date of birth is not valid.' using errcode = '22023';
  end if;
  if v_age < public.min_signup_age() then
    raise exception 'MapMeet is for people aged % and over.', public.min_signup_age()
      using errcode = '22023';
  end if;

  insert into public.user_ages (user_id, date_of_birth)
       values (auth.uid(), p_dob)
  on conflict (user_id) do update
    set date_of_birth = excluded.date_of_birth, updated_at = now();

  update public.profiles set age_confirmed = true where id = auth.uid();
end;
$$;

/** The viewer's own age, or null if they have not said.
 *
 *  Exists so a future 18+ event flag can be enforced in SQL without any
 *  screen ever reading the date itself. */
create or replace function public.viewer_age() returns int
language sql security definer stable set search_path = public as $$
  select extract(year from age(current_date, date_of_birth))::int
    from public.user_ages where user_id = auth.uid();
$$;

revoke all on function public.set_date_of_birth(date) from anon;
revoke all on function public.viewer_age() from anon;

comment on table public.user_ages is
  'Dates of birth. Separate from profiles because profiles is world-readable; owner-only by RLS, written only via set_date_of_birth().';
