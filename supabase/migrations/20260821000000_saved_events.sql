-- MapMeet — save an event without committing to it.
--
-- Until now the only two things you could do with an interesting event
-- were ignore it or announce to a room of strangers that you are coming.
-- Someone who finds a promising Saturday event on a Tuesday had no third
-- option, so most of them took the first one and we never learned they
-- were tempted.
--
-- Deliberately private. A bookmark is a thought, not a commitment, and
-- nobody else has any business reading it — no "3 people saved this"
-- counter, and no policy that would allow one later without a migration
-- that says so out loud.

create table if not exists public.saved_events (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Newest first, per person: the ordering the Saved list reads in.
create index if not exists saved_events_user_created_idx
  on public.saved_events (user_id, created_at desc);

alter table public.saved_events enable row level security;

drop policy if exists "read own saved events" on public.saved_events;
create policy "read own saved events" on public.saved_events
  for select using (auth.uid() = user_id);

drop policy if exists "save an event" on public.saved_events;
create policy "save an event" on public.saved_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "unsave an event" on public.saved_events;
create policy "unsave an event" on public.saved_events
  for delete using (auth.uid() = user_id);

-- No UPDATE policy: there is nothing in a row to change. Unsave and save
-- again.
revoke all on public.saved_events from anon;
grant select, insert, delete on public.saved_events to authenticated;

comment on table public.saved_events is
  'Private bookmarks. Owner-only in both directions; deliberately not aggregated into a public count.';
