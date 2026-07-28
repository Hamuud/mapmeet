-- =========================================================================
-- MapMeet — in-app feedback (bug reports) with photo/video attachments
-- =========================================================================
--   * feedback            — one row per submission: message, attachments
--     (jsonb array of {url, type}), plus device/app context so a bug
--     report is actionable without a follow-up round trip.
--   * feedback-media      — public bucket for the attached photos/videos,
--     keyed under the sender's uid so a user can only write their own.
--   * submit_feedback()   — insert an entry as the signed-in user.
--
-- Reads are deliberately locked down: no SELECT policy, so the table is
-- write-only from the client. Feedback is read from the dashboard / by
-- the notify-feedback Edge Function (service role), which emails it on.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  message      text not null check (char_length(btrim(message)) between 1 and 4000),
  -- [{ "url": "...", "type": "image" | "video" }, ...]
  attachments  jsonb not null default '[]'::jsonb,
  app_version  text,
  platform     text,
  created_at   timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
-- No policies at all: writes go through the definer RPC below, reads are
-- service-role only.

create or replace function public.submit_feedback(
  p_message     text,
  p_attachments jsonb default '[]'::jsonb,
  p_app_version text default null,
  p_platform    text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_body text := btrim(coalesce(p_message, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'feedback must be 1-4000 characters' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'attachments must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 10 then
    raise exception 'at most 10 attachments' using errcode = '23514';
  end if;

  insert into public.feedback (user_id, message, attachments, app_version, platform)
  values (auth.uid(), v_body, coalesce(p_attachments, '[]'::jsonb), p_app_version, p_platform)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.submit_feedback(text, jsonb, text, text) to authenticated;

-- ── Attachment bucket ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('feedback-media', 'feedback-media', true)
on conflict (id) do nothing;

drop policy if exists "public read on feedback media" on storage.objects;
create policy "public read on feedback media"
  on storage.objects for select
  using (bucket_id = 'feedback-media');

-- Users may only upload under their own uid prefix.
drop policy if exists "owner upload feedback media" on storage.objects;
create policy "owner upload feedback media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
