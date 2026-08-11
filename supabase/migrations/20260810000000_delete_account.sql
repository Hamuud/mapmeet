-- =========================================================================
-- MapMeet — user-initiated account deletion
-- =========================================================================
-- WHY
--   App Store Review Guideline 5.1.1(v): an app that lets you create an
--   account must let you delete it from inside the app. "Email us" does
--   not satisfy it.
--
-- WHAT SURVIVES, AND WHY
--   Deleting auth.users cascades through profiles into everything keyed
--   on it. Three deliberate exceptions:
--
--   1. messages / group_messages / dm_messages.sender_id are already
--      ON DELETE SET NULL, so text you sent into a conversation other
--      people are part of stays there, attributed to a deleted account.
--      We can't reach into other people's chats and rewrite them.
--
--   2. feedback.user_id is ON DELETE SET NULL, so the deletion notice
--      this function files survives the account it describes. The
--      identity is also baked into the message body as text, because by
--      the time the webhook fires the profile row is gone.
--
--   3. reports.reporter_id becomes SET NULL here. It used to cascade,
--      which meant reporting someone and then deleting your account
--      wiped the evidence out of the moderation queue — a free way to
--      un-report an abuser. The report now outlives its reporter,
--      anonymised.
--
--   Everything else about the user — profile, avatar, events, joins,
--   friendships, blocks, ratings, reviews, poll votes, reports *about*
--   them and their moderation history — goes.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1. Feedback gets a kind + reason so deletion notices are filterable ------

alter table public.feedback
  add column if not exists kind   text not null default 'feedback',
  add column if not exists reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feedback_kind_check'
  ) then
    alter table public.feedback add constraint feedback_kind_check
      check (kind in ('feedback', 'account_deletion'));
  end if;
end$$;

-- 2. Reports outlive their reporter ---------------------------------------

alter table public.reports alter column reporter_id drop not null;

do $$
declare
  v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.reports'::regclass
     and contype = 'f'
     and confrelid = 'public.profiles'::regclass
     and conkey = array[
       (select attnum from pg_attribute
         where attrelid = 'public.reports'::regclass and attname = 'reporter_id')
     ]::smallint[];
  if v_con is not null then
    execute format('alter table public.reports drop constraint %I', v_con);
  end if;
end$$;

alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

-- The admin queue inner-joined the reporter, so a null reporter would
-- have made the whole report vanish from moderation. Left join instead.
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
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_user_id
   where public.is_admin(auth.uid())
     and (p_status = 'all' or r.status = p_status)
   order by r.created_at desc
   limit 200;
$$;

-- 3. The deletion itself ---------------------------------------------------
--   SECURITY DEFINER because auth.users is not writable by `authenticated`.
--   It only ever touches auth.uid(), so there is no way to aim it at
--   somebody else's account.

create or replace function public.delete_my_account(
  p_reason  text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid      uuid := auth.uid();
  v_username text;
  v_display  text;
  v_email    text;
  v_joined   date;
  v_reason   text := coalesce(nullif(btrim(p_reason), ''), 'unspecified');
  v_details  text := nullif(btrim(coalesce(p_details, '')), '');
  v_msg      text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(v_reason) > 40 then
    raise exception 'reason too long' using errcode = '23514';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'details must be 2000 characters or fewer' using errcode = '23514';
  end if;

  select p.username, p.display_name, p.created_at::date
    into v_username, v_display, v_joined
    from public.profiles p where p.id = v_uid;

  select u.email into v_email from auth.users u where u.id = v_uid;

  -- Identity goes in the body as text: feedback.user_id is about to be
  -- nulled by the cascade, and the notifier resolves the handle from
  -- profiles, which will no longer exist when the webhook fires.
  v_msg :=
    'Account deleted by the user.' ||
    E'\n\nReason: ' || v_reason ||
    E'\nAccount: ' || coalesce(v_display, '—') || ' (@' || coalesce(v_username, '—') || ')' ||
    E'\nEmail: '   || coalesce(v_email, '—') ||
    E'\nJoined: '  || coalesce(v_joined::text, '—') ||
    E'\nUser id: ' || v_uid::text ||
    coalesce(E'\n\nWhat they told us:\n' || v_details, '');

  insert into public.feedback (user_id, kind, reason, message)
  values (v_uid, 'account_deletion', v_reason, v_msg);

  -- The avatar file is deleted by the client just before this call:
  -- Supabase forbids DELETE on storage.objects from SQL
  -- (storage.protect_delete), so it has to go through the Storage API,
  -- which the "owner delete own avatar" policy already allows.

  -- Cascades through public.profiles into everything keyed on it.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account(text, text) from public;
grant execute on function public.delete_my_account(text, text) to authenticated;
