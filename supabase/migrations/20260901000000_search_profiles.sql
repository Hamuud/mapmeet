-- People search for the Friends screen.
--
-- Searching by handle has to tolerate a near miss: someone half
-- remembers a handle, or types it with a letter wrong. Substring
-- matching alone answers the first case and not the second, so this
-- pairs LIKE with trigram similarity and ranks the two together.

-- pg_trgm ships with Supabase but is not enabled by default. It lives in
-- the `extensions` schema, which is why everything below qualifies
-- `extensions.similarity` rather than relying on a search path — the
-- function is SECURITY DEFINER, so its search_path is pinned empty and
-- every name in it is spelled out in full.
create extension if not exists pg_trgm with schema extensions;

-- Index for the similarity pass. Thirteen profiles do not need it; the
-- thirteen thousandth will, and adding it later means remembering that
-- this query exists.
create index if not exists profiles_username_trgm_idx
  on public.profiles
  using gin (lower(username) extensions.gin_trgm_ops);

/*
  Handle search, ranked.

  SECURITY DEFINER and column-limited on purpose. `authenticated` still
  holds a broad SELECT on profiles, which is a separate problem waiting
  to be narrowed — but a search endpoint is exactly the kind of thing
  that would turn that into a bulk export, so this one returns the five
  public columns and nothing else. No home coordinates, no push token,
  no phone number, whatever happens to the table grants later.

  Banned accounts are left out: a ban that still lets you be found and
  messaged is not much of a ban. So is the caller — a "find people"
  search that returns you is noise.
*/
create or replace function public.search_profiles(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select
      -- People type the handle the way they see it written, @ and all.
      -- Escape the LIKE metacharacters too: a '%' typed into a search
      -- box is a character somebody is looking for, not a wildcard that
      -- should match the entire table.
      replace(
        replace(
          replace(lower(btrim(btrim(p_query), '@')), '\', '\\'),
          '%', '\%'),
        '_', '\_') as pattern,
      lower(btrim(btrim(p_query), '@')) as needle
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.role
  from public.profiles p, q
  where q.needle <> ''
    and p.banned_at is null
    and p.id is distinct from auth.uid()
    and (
      lower(p.username) like '%' || q.pattern || '%' escape '\'
      -- 0.3 is pg_trgm's own default threshold. Below it the matches
      -- stop looking like the query to a human reading the list.
      or extensions.similarity(lower(p.username), q.needle) > 0.3
    )
  order by
    case
      when lower(p.username) = q.needle then 0                              -- exact
      when lower(p.username) like q.pattern || '%' escape '\' then 1        -- starts with
      when lower(p.username) like '%' || q.pattern || '%' escape '\' then 2 -- contains
      else 3                                                               -- merely similar
    end,
    extensions.similarity(lower(p.username), q.needle) desc,
    p.username
  limit 20;
$$;

-- Signed-in only. The map is browsable by guests; the people directory
-- is not, which matches where the auth wall already stands.
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
