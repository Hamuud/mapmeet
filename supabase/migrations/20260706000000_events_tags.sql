-- =========================================================================
-- MapMeet — events.tags
-- =========================================================================
-- Postgres rejects subqueries inside CHECK constraints. SQL functions
-- (`language sql`) get inlined by the planner, which re-exposes any
-- subquery hiding inside — that's why the previous attempt still hit
-- 0A000 despite wrapping the check in a function.
--
-- The fix is `language plpgsql`: the planner treats those as opaque, so
-- the CHECK only sees a bare function call.
--
-- Idempotent: safe to re-run after any partial previous attempt.
-- =========================================================================

-- 1. Column ---------------------------------------------------------------
--   Backfill default satisfies the min-length + regex checks so existing
--   rows validate cleanly.
alter table public.events
  add column if not exists tags text[] not null default array['general']::text[];

-- 2. Per-element validator -----------------------------------------------
--   plpgsql + IMMUTABLE = legal inside a CHECK. FOREACH ARRAY iterates
--   without needing a SELECT, which is what tripped the planner before.
create or replace function public.tags_are_valid(p_tags text[])
returns boolean
language plpgsql
immutable
as $$
declare
  t text;
begin
  if p_tags is null then
    return true;
  end if;
  foreach t in array p_tags loop
    if t !~ '^[a-z0-9_-]{2,24}$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- 3. Constraint ----------------------------------------------------------
alter table public.events
  drop constraint if exists events_tags_min;

alter table public.events
  add constraint events_tags_min check (
    array_length(tags, 1) between 1 and 5
    and public.tags_are_valid(tags)
  );

-- 4. Index ---------------------------------------------------------------
--   GIN over the array keeps `tags @> array['coffee']` and
--   `tags && array['coffee', 'study']` index-backed as we grow.
create index if not exists events_tags_gin_idx
  on public.events using gin (tags);
