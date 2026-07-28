-- =========================================================================
-- MapMeet — admin roles, reports queue, and moderation actions
-- =========================================================================
--   * profiles.is_admin            — grants the Complaints & reports screen.
--   * profiles.muted_until / banned_at / warning_count — moderation state.
--   * reports                      — user-submitted complaints.
--   * moderation_log               — audit trail of every admin action.
--
-- ENFORCEMENT
--   can_post(uid) is false while a user is banned or inside a mute
--   window. BEFORE INSERT triggers on messages / group_messages /
--   dm_messages / events / user_reviews reject their writes, so a mute
--   covers every path — text, voice, polls, events, reviews — including
--   any future RPC, rather than being bolted onto each one.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists is_admin      boolean not null default false,
  add column if not exists muted_until   timestamptz,
  add column if not exists banned_at     timestamptz,
  add column if not exists warning_count integer not null default 0;

-- Seed the first admin.
update public.profiles set is_admin = true where lower(username) = 'artem';

create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false);
$$;

/** False while banned or serving a mute. */
create or replace function public.can_post(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select banned_at is null and (muted_until is null or muted_until <= now())
      from public.profiles where id = p_user
  ), false);
$$;

-- ── Reports ──────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_type     text not null check (target_type in ('user','review','event','hashtag','message')),
  -- Who the complaint is about (null for a pure hashtag report).
  target_user_id  uuid references public.profiles(id) on delete cascade,
  -- Row being reported (review id, event id, message id) when applicable.
  target_id       uuid,
  -- Free text target: the offending hashtag, etc.
  target_text     text,
  reasons         text[] not null check (cardinality(reasons) between 1 and 10),
  details         text check (details is null or char_length(details) <= 1000),
  status          text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution_note text,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_user_id);

alter table public.reports enable row level security;
drop policy if exists "read own or admin reports" on public.reports;
create policy "read own or admin reports" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.moderation_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles(id) on delete set null,
  target_id  uuid references public.profiles(id) on delete cascade,
  action     text not null,
  detail     text,
  report_id  uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.moderation_log enable row level security;
drop policy if exists "admins read moderation log" on public.moderation_log;
create policy "admins read moderation log" on public.moderation_log
  for select to authenticated using (public.is_admin(auth.uid()));

-- ── Submit a report (any signed-in user) ─────────────────────────────────

create or replace function public.submit_report(
  p_target_type text,
  p_reasons     text[],
  p_target_user uuid default null,
  p_target_id   uuid default null,
  p_target_text text default null,
  p_details     text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
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

  insert into public.reports (reporter_id, target_type, target_user_id, target_id,
                              target_text, reasons, details)
  values (auth.uid(), p_target_type, p_target_user, p_target_id,
          nullif(btrim(coalesce(p_target_text,'')), ''), p_reasons,
          nullif(btrim(coalesce(p_details,'')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Admin: queue + actions ───────────────────────────────────────────────

create or replace function public.admin_list_reports(p_status text default 'open')
returns table (
  id uuid, target_type text, target_id uuid, target_text text,
  reasons text[], details text, status text, created_at timestamptz,
  reporter_username text, reporter_display_name text,
  target_user_id uuid, target_username text, target_display_name text,
  target_avatar_url text, target_banned boolean, target_muted_until timestamptz,
  target_warnings integer, target_report_count bigint
)
language sql stable security definer set search_path = public as $$
  select r.id, r.target_type, r.target_id, r.target_text,
         r.reasons, r.details, r.status, r.created_at,
         rp.username, rp.display_name,
         r.target_user_id, tp.username, tp.display_name, tp.avatar_url,
         (tp.banned_at is not null), tp.muted_until, tp.warning_count,
         (select count(*) from public.reports r2
           where r2.target_user_id = r.target_user_id and r2.status <> 'dismissed')
    from public.reports r
    join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_user_id
   where public.is_admin(auth.uid())
     and (p_status = 'all' or r.status = p_status)
   order by r.created_at desc
   limit 200;
$$;

create or replace function public.admin_resolve_report(
  p_report uuid, p_status text, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_status not in ('open','resolved','dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.reports
     set status = p_status,
         resolution_note = nullif(btrim(coalesce(p_note,'')), ''),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_report;
end;
$$;

/** Warn / mute / ban. p_minutes: mute length; 0 clears a mute. */
create or replace function public.admin_moderate_user(
  p_user    uuid,
  p_action  text,
  p_minutes integer default null,
  p_report  uuid default null,
  p_note    text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'no target user' using errcode = '23514';
  end if;
  if public.is_admin(p_user) then
    raise exception 'cannot moderate another admin' using errcode = '42501';
  end if;

  if p_action = 'warn' then
    update public.profiles set warning_count = warning_count + 1 where id = p_user;
  elsif p_action = 'mute' then
    if coalesce(p_minutes, 0) <= 0 then
      raise exception 'mute needs a duration' using errcode = '23514';
    end if;
    update public.profiles
       set muted_until = now() + make_interval(mins => p_minutes) where id = p_user;
  elsif p_action = 'unmute' then
    update public.profiles set muted_until = null where id = p_user;
  elsif p_action = 'ban' then
    update public.profiles set banned_at = now() where id = p_user;
  elsif p_action = 'unban' then
    update public.profiles set banned_at = null, muted_until = null where id = p_user;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;

  insert into public.moderation_log (admin_id, target_id, action, detail, report_id)
  values (auth.uid(), p_user, p_action,
          case when p_action = 'mute' then p_minutes || ' minutes' else nullif(btrim(coalesce(p_note,'')),'') end,
          p_report);
end;
$$;

/** Remove a review an admin judges false/abusive. */
create or replace function public.admin_delete_review(p_review uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select target_id into v_target from public.user_reviews where id = p_review;
  delete from public.user_reviews where id = p_review;
  insert into public.moderation_log (admin_id, target_id, action, detail)
  values (auth.uid(), v_target, 'delete_review', p_review::text);
end;
$$;

/** The caller's own moderation state — lets the UI explain a mute. */
create or replace function public.my_moderation_state()
returns table (muted_until timestamptz, banned boolean, warnings integer, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select muted_until, banned_at is not null, warning_count, is_admin
    from public.profiles where id = auth.uid();
$$;

-- ── Enforcement triggers ─────────────────────────────────────────────────

create or replace function public.enforce_can_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  -- Separate statements, not a CASE expression: PL/pgSQL resolves every
  -- branch of an expression against NEW's row type at plan time, so
  -- referencing creator_id while inserting a message errors with
  -- 'record "new" has no field'. Per-branch assignments are only planned
  -- on the path actually taken.
  if tg_table_name = 'events' then
    v_actor := new.creator_id;
  elsif tg_table_name = 'user_reviews' then
    v_actor := new.author_id;
  else
    v_actor := new.sender_id;
  end if;

  if v_actor is null then
    return new; -- system-authored row
  end if;
  if not public.can_post(v_actor) then
    raise exception 'your account is restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_can_post_messages       on public.messages;
create trigger enforce_can_post_messages       before insert on public.messages
  for each row execute function public.enforce_can_post();
drop trigger if exists enforce_can_post_group_messages on public.group_messages;
create trigger enforce_can_post_group_messages before insert on public.group_messages
  for each row execute function public.enforce_can_post();
drop trigger if exists enforce_can_post_dm_messages    on public.dm_messages;
create trigger enforce_can_post_dm_messages    before insert on public.dm_messages
  for each row execute function public.enforce_can_post();
drop trigger if exists enforce_can_post_events         on public.events;
create trigger enforce_can_post_events         before insert on public.events
  for each row execute function public.enforce_can_post();
drop trigger if exists enforce_can_post_reviews        on public.user_reviews;
create trigger enforce_can_post_reviews        before insert on public.user_reviews
  for each row execute function public.enforce_can_post();

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function public.is_admin(uuid)                                   to authenticated;
grant execute on function public.can_post(uuid)                                   to authenticated;
grant execute on function public.submit_report(text, text[], uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_list_reports(text)                         to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text)           to authenticated;
grant execute on function public.admin_moderate_user(uuid, text, integer, uuid, text) to authenticated;
grant execute on function public.admin_delete_review(uuid)                        to authenticated;
grant execute on function public.my_moderation_state()                            to authenticated;
