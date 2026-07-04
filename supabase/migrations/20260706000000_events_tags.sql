-- =========================================================================
-- MapMeet — events.tags
-- =========================================================================
-- Adds a required tag array so users can search / filter by topic. The
-- backfill default satisfies the min-length check for existing rows;
-- new inserts must pass an explicit non-empty array from the client.
-- =========================================================================

alter table public.events
  add column if not exists tags text[] not null default array['general']::text[];

-- 1..5 tags per event, each 2..24 chars, allow letters/digits/dash/underscore
-- (client normalizes spaces → dashes and forces lowercase).
alter table public.events
  drop constraint if exists events_tags_min;

alter table public.events
  add constraint events_tags_min check (
    array_length(tags, 1) between 1 and 5
    and (
      select bool_and(t ~ '^[a-z0-9_-]{2,24}$')
      from unnest(tags) as t
    )
  );

-- GIN over the array lets `tags @> array['coffee']` and
-- `tags && array['coffee', 'study']` stay index-backed as we grow.
create index if not exists events_tags_gin_idx
  on public.events using gin (tags);
