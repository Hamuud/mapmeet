-- =========================================================================
-- MapMeet — remove a reported event, and cap how often one account can
--           file reports
-- =========================================================================
-- Two halves of the same problem. The queue could take a tag off an
-- event but not take the event down, so an event that is wholly against
-- the rules could only be answered by banning its host. And nothing
-- stopped one account filing fifty complaints about somebody it had
-- taken against, which is both harassment and a denial-of-service on the
-- moderators reading them.
--
--   admin_delete_event()  — staff remove the event itself.
--   submit_report()       — 3 reports per rolling 24h; staff exempt.
--
-- ROLLING 24 HOURS, again
--   Same reasoning as the marker cap in 20260824000000: a calendar day
--   needs a timezone with no right answer, and it resets at an instant
--   the spammer can see coming. No ledger table is needed here, though —
--   unlike events, nothing ever deletes a `reports` row, so the rows
--   themselves are the count. delete_my_account() nulls reporter_id
--   rather than removing them, which is why that still holds.
--
-- WHAT DELETING AN EVENT DOES
--   capture_event_cancellation() already runs BEFORE DELETE, so the
--   people who had joined get the same "it's cancelled" push a host
--   deletion sends. That is deliberate: someone planning their evening
--   around an event needs to know it is gone more than they need to know
--   why, and it does not announce the host's rule-breaking to everyone.
--   Chat, participants and saves cascade with the row as usual.
--
--   Every OPEN report about that event is resolved in the same
--   transaction — not just the one the moderator acted from. Three
--   people reporting the same event is the normal case, and leaving two
--   complaints pointing at a row that no longer exists would put a
--   dead-end card in the queue for the next moderator.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Taking the event down
-- -------------------------------------------------------------------------
/** Staff-only. Returns the number of open reports it closed alongside
 *  the event, so the panel can say so. */
create or replace function public.admin_delete_event(
  p_event  uuid,
  p_report uuid default null,
  p_note   text default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_title   text;
  v_creator uuid;
  v_closed  integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_event is null then
    raise exception 'no target event' using errcode = '23514';
  end if;

  select e.title, e.creator_id into v_title, v_creator
    from public.events e where e.id = p_event;
  if not found then
    raise exception 'no such event' using errcode = '42704';
  end if;

  -- Resolved BEFORE the delete: reports.target_id carries no foreign key
  -- to events, so this would still work afterwards, but doing it first
  -- keeps the whole action in one obvious order.
  update public.reports
     set status = 'resolved',
         resolution_note = coalesce(
           nullif(btrim(coalesce(p_note, '')), ''), 'event removed'),
         resolved_by = auth.uid(),
         resolved_at = now()
   where target_type = 'event' and target_id = p_event and status = 'open';
  get diagnostics v_closed = row_count;

  delete from public.events where id = p_event;

  -- target_id on the log references profiles: it records the host, and
  -- the detail line records what was removed.
  insert into public.moderation_log (admin_id, target_id, action, detail, report_id)
  values (auth.uid(), v_creator, 'delete_event',
          format('%s (event %s)', coalesce(v_title, '?'), p_event),
          p_report);

  return v_closed;
end;
$$;

-- -------------------------------------------------------------------------
-- 2. Capping reports
-- -------------------------------------------------------------------------
/** Reports per rolling 24h for a given profiles.role. NULL = unlimited.
 *
 *  Staff are exempt because they are the ones acting on the queue, and
 *  a moderator working through a bad afternoon should not run out of
 *  complaints they can file. Everyone else gets three: enough to report
 *  the genuinely bad things you see in a day, not enough to bury someone.
 *
 *  Written as a fall-through so an unrecognised or NULL role lands on
 *  the strict side — the same rule as daily_event_limit(). */
create or replace function public.daily_report_limit(p_role text)
returns integer language sql stable as $$
  select case when p_role = any(public.staff_roles()) then null else 3 end;
$$;

/** How many reports the caller has left in the current window.
 *  `max_per_day` NULL means unlimited; `resets_at` is when the oldest
 *  report in the window ages out. */
create or replace function public.my_report_quota()
returns table (used integer, max_per_day integer, resets_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  select public.daily_report_limit(p.role) into max_per_day
    from public.profiles p where p.id = v_uid;
  if not found then
    max_per_day := public.daily_report_limit('user');
  end if;

  select count(*)::int, min(r.created_at) + interval '24 hours'
    into used, resets_at
    from public.reports r
   where r.reporter_id = v_uid
     and r.created_at > now() - interval '24 hours';

  return next;
end;
$$;

create or replace function public.submit_report(
  p_target_type text,
  p_reasons     text[],
  p_target_user uuid default null,
  p_target_id   uuid default null,
  p_target_text text default null,
  p_details     text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_limit  integer;
  v_used   integer;
  v_oldest timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_type not in ('user','review','event','hashtag','message') then
    raise exception 'invalid report target' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_reasons), 0) = 0 then
    raise exception 'pick at least one reason' using errcode = '23514';
  end if;
  if p_target_user = auth.uid() then
    raise exception 'you cannot report yourself' using errcode = '23514';
  end if;

  select public.daily_report_limit(p.role) into v_limit
    from public.profiles p where p.id = auth.uid();
  if not found then
    v_limit := public.daily_report_limit('user');
  end if;

  if v_limit is not null then
    -- Serialised per reporter, so two taps in flight at once can't both
    -- read "2 used" and both pass. Same shape as the marker cap.
    perform pg_advisory_xact_lock(
      hashtext('mapmeet_report_quota'), hashtext(auth.uid()::text));

    select count(*)::int, min(r.created_at)
      into v_used, v_oldest
      from public.reports r
     where r.reporter_id = auth.uid()
       and r.created_at > now() - interval '24 hours';

    if v_used >= v_limit then
      -- Machine-readable: the client splits on spaces to show the cap
      -- and the minute the next slot opens. 42501 = insufficient_privilege.
      raise exception 'REPORT_LIMIT % %',
        v_limit,
        to_char((v_oldest + interval '24 hours') at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        using errcode = '42501';
    end if;
  end if;

  insert into public.reports (reporter_id, target_type, target_user_id, target_id,
                              target_text, reasons, details)
  values (auth.uid(), p_target_type, p_target_user, p_target_id,
          nullif(btrim(coalesce(p_target_text,'')), ''), p_reasons,
          nullif(btrim(coalesce(p_details,'')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- The count reads (reporter_id, created_at) for one account; without
-- this it is a seq scan over every report ever filed on each submit.
create index if not exists reports_reporter_time_idx
  on public.reports (reporter_id, created_at desc);

grant execute on function public.admin_delete_event(uuid, uuid, text) to authenticated;
grant execute on function public.daily_report_limit(text)             to authenticated;
grant execute on function public.my_report_quota()                    to authenticated;
