-- =========================================================================
-- MapMeet — richer profiles
-- =========================================================================
-- Adds the columns the redesigned "You" screen needs: a short bio, a
-- phone number, and a fixed vocabulary of interest tags. Vocabulary
-- is enforced by CHECK — the client picker exposes only these labels
-- so the DB stays queryable ("show me nearby event creators into
-- 'films'") without ballooning into free-text.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists bio       text,
  add column if not exists phone     text,
  add column if not exists interests text[] not null default '{}'::text[];

-- Bio is short-form only — keeps the "You" card readable and prevents
-- someone dumping War & Peace into a profile.
alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 240);

-- Loose phone validation — 6–24 chars, digits/space/+/-/() only. Full
-- E.164 parsing lives in the client if we ever need it.
alter table public.profiles
  drop constraint if exists profiles_phone_shape;
alter table public.profiles
  add constraint profiles_phone_shape check (
    phone is null or phone ~ '^[0-9 +().-]{6,24}$'
  );

-- Interests: elements must come from the fixed vocab, cap at 8. Same
-- plpgsql trick as events.tags (SQL functions get inlined and re-expose
-- the subquery inside CHECK).
create or replace function public.interests_are_valid(p_interests text[])
returns boolean
language plpgsql
immutable
as $$
declare
  t text;
begin
  if p_interests is null then
    return true;
  end if;
  foreach t in array p_interests loop
    if t not in (
      'films','coffee','running','books','music','food','travel',
      'photography','art','games','fitness','yoga','tech','outdoors',
      'nightlife','spontaneous'
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_interests_shape;
alter table public.profiles
  add constraint profiles_interests_shape check (
    coalesce(array_length(interests, 1), 0) <= 8
    and public.interests_are_valid(interests)
  );
