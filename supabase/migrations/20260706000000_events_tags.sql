-- =========================================================================
-- MapMeet — events.tags
-- =========================================================================
-- Adds a required tag array so users can search / filter by topic.
--
-- Postgres does not allow subqueries in CHECK constraints ("cannot use
-- subquery in check constraint"), so the per-element regex check lives
-- in an IMMUTABLE helper function — those *are* allowed. The client
-- normalizer (utils/tags.ts) shapes user input to match the same regex.
--
-- Idempotent: safe to re-run after a partial previous attempt.
-- =========================================================================

-- 1. Column ---------------------------------------------------------------
--   Backfill default satisfies both the min-length and regex checks so
--   existing rows validate cleanly.
alter table public.events
  add column if not exists tags text[] not null default array['general']::text[];

-- 2. Per-element validator -----------------------------------------------
--   IMMUTABLE + language sql keeps this optimizable and legal to embed
--   in a CHECK constraint. `coalesce(..., true)` covers empty arrays so
--   the length check owns the "must have at least one tag" rule.
create or replace function public.tags_are_valid(tags text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(t ~ '^[a-z0-9_-]{2,24}$'), true)
  from unnest(tags) as t;
$$;

-- 3. Constraint ----------------------------------------------------------
--   Recreated on every run so schema drift doesn't leave stale checks
--   behind.
alter table public.events
  drop constraint if exists events_tags_min;

alter table public.events
  add constraint events_tags_min check (
    array_length(tags, 1) between 1 and 5
    and public.tags_are_valid(tags)
  );

-- 4. Index ---------------------------------------------------------------
--   GIN over the array lets `tags @> array['coffee']` and
--   `tags && array['coffee', 'study']` stay index-backed as we grow.
create index if not exists events_tags_gin_idx
  on public.events using gin (tags);
