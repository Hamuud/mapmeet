-- =========================================================================
-- MapMeet — user ratings (like / dislike) + anonymous text reviews
-- =========================================================================
-- Taxi-style rating: everyone starts at 5.0, computed as if seeded with
-- 200 positive reviews:
--
--     rating = 5 * (200 + likes) / (200 + likes + dislikes)
--
-- The seed constant lives client-side (utils/rating.ts); the DB stores
-- raw votes only.
--
--   * user_ratings — one vote per (rater, target): +1 like / -1 dislike.
--   * user_reviews — one anonymous text review per (author, target).
--     author_id is stored for dedup + moderation but NEVER exposed:
--     reads go through list_user_reviews, which omits it.
--
-- Both tables have RLS enabled with no policies — PostgREST can't touch
-- them directly; all access flows through the security-definer RPCs.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create table if not exists public.user_ratings (
  rater_id   uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rater_id, target_id),
  check (rater_id <> target_id)
);

create table if not exists public.user_reviews (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (author_id, target_id),
  check (author_id <> target_id)
);

alter table public.user_ratings enable row level security;
alter table public.user_reviews enable row level security;

create index if not exists user_ratings_target_idx on public.user_ratings (target_id);
create index if not exists user_reviews_target_idx on public.user_reviews (target_id);

-- Cast, change, or withdraw a vote. p_value: 1 like, -1 dislike, 0 remove.
create or replace function public.rate_user(p_target_id uuid, p_value integer)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'you cannot rate yourself' using errcode = '23514';
  end if;

  if p_value = 0 then
    delete from public.user_ratings
     where rater_id = auth.uid() and target_id = p_target_id;
  elsif p_value in (-1, 1) then
    insert into public.user_ratings (rater_id, target_id, value)
    values (auth.uid(), p_target_id, p_value)
    on conflict (rater_id, target_id)
    do update set value = excluded.value, updated_at = now();
  else
    raise exception 'invalid vote' using errcode = '23514';
  end if;
end;
$$;

-- Vote counts + the caller's own vote — without exposing who voted.
create or replace function public.get_user_rating(p_user_id uuid)
returns table (likes bigint, dislikes bigint, my_vote smallint)
language sql
security definer
stable
as $$
  select
    count(*) filter (where value = 1)  as likes,
    count(*) filter (where value = -1) as dislikes,
    coalesce(
      (select value from public.user_ratings
        where target_id = p_user_id and rater_id = auth.uid()),
      0
    )::smallint as my_vote
  from public.user_ratings
  where target_id = p_user_id;
$$;

-- Leave (or replace) your anonymous review of another user.
create or replace function public.add_user_review(p_target_id uuid, p_text text)
returns void
language plpgsql
security definer
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'you cannot review yourself' using errcode = '23514';
  end if;
  if char_length(v_text) < 1 or char_length(v_text) > 500 then
    raise exception 'review must be 1-500 characters' using errcode = '23514';
  end if;

  insert into public.user_reviews (author_id, target_id, text)
  values (auth.uid(), p_target_id, v_text)
  on conflict (author_id, target_id)
  do update set text = excluded.text, created_at = now();
end;
$$;

-- Reviews for a profile — anonymised (no author in the output shape).
create or replace function public.list_user_reviews(p_user_id uuid)
returns table (id uuid, text text, created_at timestamptz)
language sql
security definer
stable
as $$
  select id, text, created_at
  from public.user_reviews
  where target_id = p_user_id
  order by created_at desc
  limit 100;
$$;

grant execute on function public.rate_user(uuid, integer) to authenticated;
grant execute on function public.get_user_rating(uuid) to authenticated;
grant execute on function public.add_user_review(uuid, text) to authenticated;
grant execute on function public.list_user_reviews(uuid) to authenticated;
