-- =========================================================================
-- MapMeet — events.tags: allow non-English tags
-- =========================================================================
-- The original CHECK constraint required `^[a-z0-9_-]{2,24}$`, which
-- rejected Cyrillic ("кава"), Chinese, emoji, etc. Users can create
-- events in their own language and expect to tag them the same way.
--
-- Relax to "2–24 characters, no whitespace" so any script works.
-- Length still bounds abuse; the client-side normalizer (`normalizeTag`)
-- still trims + collapses whitespace + lowercases what it can.
--
-- Idempotent: safe to re-run.
-- =========================================================================

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
    -- 2..24 chars, no whitespace, no line breaks.
    if t !~ '^\S{2,24}$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
