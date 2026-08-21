-- =========================================================================
-- MapMeet — let staff strip a rule-breaking tag off an event
-- =========================================================================
-- A complaint about a tag ("Prohibited hashtag" is already one of the
-- report reasons) arrives as a report on the EVENT. Until now the queue
-- could only act on the account behind it: warn, mute, ban. That is the
-- wrong size of hammer for one bad word on an otherwise fine event —
-- and it left the tag on the map either way.
--
-- Two pieces:
--   1. admin_list_reports() now carries the event's current tags, so the
--      queue can show them without a second round trip per report.
--   2. admin_remove_event_tags() strips the named tags and writes it to
--      the moderation log like any other action.
--
-- WHY IT KEEPS ONE TAG
--   events_tags_min is `array_length(tags,1) between 1 and 5`. Stripping
--   the only tag would violate it, and an empty array would also make
--   the event invisible to every tag filter. So the last removal leaves
--   'general' — the same neutral default a new event gets.
--
-- WHO
--   is_admin(), i.e. designer / support / admin / owner — the same set
--   that can already warn, mute and ban. No new tier.
--
-- WHAT IT DOESN'T DO
--   It does not touch the event otherwise, and `notify_event_change`
--   only fires on date / time / coordinates / title — so retagging an
--   event does NOT push "the event changed" to everyone attending.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The queue learns what the event is tagged
-- -------------------------------------------------------------------------
-- Dropped first: the OUT-parameter list gains a column, which CREATE OR
-- REPLACE cannot do.
drop function if exists public.admin_list_reports(text);
create or replace function public.admin_list_reports(p_status text default 'open')
returns table (
  id uuid, target_type text, target_id uuid, target_text text,
  reasons text[], details text, status text, created_at timestamptz,
  reporter_username text, reporter_display_name text,
  target_user_id uuid, target_username text, target_display_name text,
  target_avatar_url text, target_banned boolean, target_muted_until timestamptz,
  target_warnings integer, target_report_count bigint,
  target_event_tags text[]
)
language sql stable security definer set search_path = public as $$
  select r.id, r.target_type, r.target_id, r.target_text,
         r.reasons, r.details, r.status, r.created_at,
         rp.username, rp.display_name,
         r.target_user_id, tp.username, tp.display_name, tp.avatar_url,
         (tp.banned_at is not null), tp.muted_until, tp.warning_count,
         (select count(*) from public.reports r2
           where r2.target_user_id = r.target_user_id and r2.status <> 'dismissed'),
         -- NULL for every other kind of report, which is how the panel
         -- tells "not an event" apart from "an event with no tags".
         ev.tags
    from public.reports r
    join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_user_id
    left join public.events ev
           on r.target_type = 'event' and ev.id = r.target_id
   where public.is_admin(auth.uid())
     and (p_status = 'all' or r.status = p_status)
   order by r.created_at desc
   limit 200;
$$;

-- -------------------------------------------------------------------------
-- 2. Removing them
-- -------------------------------------------------------------------------
/** Strip `p_tags` from an event. Returns the tags that remain, so the
 *  caller can repaint without re-listing the whole queue.
 *
 *  Matching is case-insensitive. Tags are stored as the creator typed
 *  them and `normalizeTag` only lowercases what a locale can lowercase,
 *  so an exact-match delete would quietly miss 'İSTANBUL'.
 *
 *  A no-op (nothing matched) returns the current tags untouched rather
 *  than raising: two moderators working the same report should not see
 *  an error for agreeing with each other. */
create or replace function public.admin_remove_event_tags(
  p_event  uuid,
  p_tags   text[],
  p_report uuid default null
)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_before  text[];
  v_after   text[];
  v_removed text[];
  v_creator uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_event is null or coalesce(array_length(p_tags, 1), 0) = 0 then
    raise exception 'nothing to remove' using errcode = '23514';
  end if;

  -- Locked for the read-modify-write: two moderators removing two
  -- different tags at once must not clobber each other's edit.
  select e.tags, e.creator_id into v_before, v_creator
    from public.events e where e.id = p_event for update;
  if not found then
    raise exception 'no such event' using errcode = '42704';
  end if;

  select coalesce(array_agg(u.tg order by u.ord), '{}')
    into v_removed
    from unnest(v_before) with ordinality as u(tg, ord)
   where exists (
     select 1 from unnest(p_tags) x(bad) where lower(x.bad) = lower(u.tg)
   );

  if coalesce(array_length(v_removed, 1), 0) = 0 then
    return v_before;
  end if;

  select coalesce(array_agg(u.tg order by u.ord), '{}')
    into v_after
    from unnest(v_before) with ordinality as u(tg, ord)
   where not exists (
     select 1 from unnest(p_tags) x(bad) where lower(x.bad) = lower(u.tg)
   );

  -- See the header: one tag is the floor, and 'general' is the floor's
  -- name everywhere else in the schema.
  if coalesce(array_length(v_after, 1), 0) = 0 then
    v_after := array['general']::text[];
  end if;

  update public.events set tags = v_after where id = p_event;

  -- target_id on the log references profiles, so it records WHO was
  -- moderated — the host — and the detail line records what was taken
  -- off which event.
  insert into public.moderation_log (admin_id, target_id, action, detail, report_id)
  values (auth.uid(), v_creator, 'remove_event_tags',
          format('%s (event %s)', array_to_string(v_removed, ', '), p_event),
          p_report);

  return v_after;
end;
$$;

grant execute on function public.admin_list_reports(text)                  to authenticated;
grant execute on function public.admin_remove_event_tags(uuid, text[], uuid) to authenticated;
