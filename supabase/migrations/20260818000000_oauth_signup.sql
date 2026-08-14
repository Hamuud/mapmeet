-- =========================================================================
-- MapMeet — profiles that survive an OAuth signup
-- =========================================================================
-- handle_new_user() was written for one signup path: the email form,
-- which puts `username` and `display_name` into raw_user_meta_data
-- itself. Google sends neither. It sends `full_name` / `name`,
-- `avatar_url` / `picture` and `email`, so every account created through
-- Google would have landed as:
--
--   username      user_1a2b3c4d      (fine, but arbitrary)
--   display_name  'New user'         ← every single one of them
--
-- This rewrites the trigger to read whichever shape it was given, and
-- adds `onboarding_complete` so the app can tell the difference between
-- "chose their own handle" and "we invented one" — the latter gets a
-- one-time screen to fix it.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists onboarding_complete boolean not null default true;

comment on column public.profiles.onboarding_complete is
  'False only while an OAuth account still has the username we generated '
  'for it. Existing rows default to true — nobody who signed up through '
  'the email form should be sent to a screen asking them to do it again.';

-- -------------------------------------------------------------------------
-- Username generation
-- -------------------------------------------------------------------------
/** Squeeze an arbitrary string into the shape profiles_username_check
 *  demands: 3–24 of [a-zA-Z0-9_.]. Returns null when nothing usable
 *  survives, so the caller can fall back. */
create or replace function public.slugify_username(p_raw text)
returns text language sql immutable as $$
  select nullif(
    substr(
      regexp_replace(
        -- Strip accents so "Олекса" and "Renée" don't both collapse to
        -- nothing; unaccent isn't installed, so this is a plain filter
        -- and non-Latin names simply fall through to the caller's
        -- fallback rather than producing a one-character handle.
        lower(coalesce(p_raw, '')), '[^a-zA-Z0-9_.]', '', 'g'
      ), 1, 24
    ), ''
  );
$$;

/** A username nobody has yet, derived from `p_seed` where possible.
 *
 *  Tries the seed, then the seed with a counter, then gives up and uses
 *  the user id — which is unique by construction. The loop is bounded:
 *  an unbounded "try until free" against a unique index is a nice way to
 *  hang a signup. */
create or replace function public.unique_username(p_seed text, p_user uuid)
returns text language plpgsql stable set search_path = public as $$
declare
  v_base text := public.slugify_username(p_seed);
  v_try  text;
  i      integer := 0;
begin
  -- Nothing usable survived the filter — a Cyrillic-only name, or no
  -- email at all. Seed from the id rather than padding to a bare
  -- 'user': that would funnel every such signup onto one contended
  -- base and hand out user, user1, user2… in order of arrival.
  if v_base is null or char_length(v_base) < 3 then
    return 'user_' || substr(p_user::text, 1, 8);
  end if;
  v_base := substr(v_base, 1, 20);

  loop
    v_try := case when i = 0 then v_base else v_base || i::text end;
    exit when not exists (select 1 from public.profiles where lower(username) = lower(v_try));
    i := i + 1;
    if i > 50 then
      -- Vanishingly unlikely; the id suffix is guaranteed free.
      v_try := 'user_' || substr(p_user::text, 1, 8);
      exit;
    end if;
  end loop;
  return v_try;
end;
$$;

-- -------------------------------------------------------------------------
-- The trigger
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m            jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username   text  := nullif(btrim(coalesce(m->>'username', '')), '');
  v_display    text;
  v_avatar     text;
  v_onboarded  boolean;
begin
  -- Google and Apple both put the human name under one of these; the
  -- email form puts it under display_name. Falling back to the email's
  -- local part beats 'New user' by a mile.
  v_display := coalesce(
    nullif(btrim(coalesce(m->>'display_name', '')), ''),
    nullif(btrim(coalesce(m->>'full_name',    '')), ''),
    nullif(btrim(coalesce(m->>'name',         '')), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New user'
  );

  -- Supabase normalises Google's `picture` into `avatar_url`, but not
  -- for every provider — read both.
  v_avatar := coalesce(
    nullif(btrim(coalesce(m->>'avatar_url', '')), ''),
    nullif(btrim(coalesce(m->>'picture',    '')), '')
  );

  -- A username in the metadata means the email form collected one, so
  -- the account is already set up. Anything else is a handle we made up.
  v_onboarded := v_username is not null;

  if v_username is null then
    v_username := public.unique_username(
      coalesce(split_part(coalesce(new.email, ''), '@', 1), v_display),
      new.id
    );
  end if;

  insert into public.profiles (
    id, username, display_name, avatar_url, onboarding_complete
  )
  values (
    new.id,
    v_username,
    substr(v_display, 1, 40),
    v_avatar,
    v_onboarded
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- Finishing an OAuth signup
-- -------------------------------------------------------------------------
/** Set the handle and name an OAuth user actually wants, and mark them
 *  done.
 *
 *  An RPC rather than a column grant because `onboarding_complete` is
 *  not the client's to set — see 20260815000000. The username checks
 *  live here too so the screen gets a usable error instead of a raw
 *  constraint violation. */
create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_username text := btrim(coalesce(p_username, ''));
  v_display  text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_username !~ '^[a-zA-Z0-9_.]{3,24}$' then
    raise exception 'USERNAME_INVALID' using errcode = '22023';
  end if;
  if char_length(v_display) < 1 or char_length(v_display) > 40 then
    raise exception 'DISPLAY_NAME_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.profiles
     where lower(username) = lower(v_username) and id <> auth.uid()
  ) then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end if;

  update public.profiles
     set username = v_username,
         display_name = v_display,
         onboarding_complete = true
   where id = auth.uid();
end;
$$;

/** Is a handle free? Powers the live check on the onboarding screen so
 *  the user finds out before they submit. */
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select btrim(coalesce(p_username, '')) ~ '^[a-zA-Z0-9_.]{3,24}$'
     and not exists (
       select 1 from public.profiles
        where lower(username) = lower(btrim(p_username))
          and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;

grant execute on function public.complete_onboarding(text, text) to authenticated;
grant execute on function public.username_available(text)        to authenticated;
