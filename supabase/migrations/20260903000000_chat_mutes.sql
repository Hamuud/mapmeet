-- Mute one conversation.
--
-- Notification preferences were categories and nothing else: push_chat
-- on or off, for every chat at once. One loud event chat therefore cost
-- you every message notification in the app, which is not a choice
-- anyone should have to make — so people turn the category off and then
-- miss the messages that mattered.

create table if not exists public.chat_mutes (
  -- Defaulted from the JWT so the client never sends it, and the check
  -- below means it could not lie about it anyway.
  user_id    uuid not null default auth.uid()
             references auth.users(id) on delete cascade,
  -- Which kind of room. The three live in different tables and share no
  -- id space, so the scope is what keeps a group id from muting an
  -- event that happens to have the same uuid.
  scope      text not null check (scope in ('event', 'dm', 'group')),
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scope, target_id)
);

alter table public.chat_mutes enable row level security;

-- Your own mutes, and only ever your own. Muting is not something you
-- can do to somebody else, and who has muted what is nobody's business
-- but theirs.
drop policy if exists "own chat mutes" on public.chat_mutes;
create policy "own chat mutes" on public.chat_mutes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- anon picks up a table-level SELECT from the schema's default grants,
-- which RLS would block anyway — but leaving a grant in place that only
-- a policy makes harmless is not how the rest of this schema is
-- written. Take it away and say so.
revoke all on public.chat_mutes from anon;
grant select, insert, delete on public.chat_mutes to authenticated;

-- The notify function asks the other way round — "of these recipients,
-- who muted this room?" — so it reads by (scope, target_id) with the
-- primary key no help at all.
create index if not exists chat_mutes_target_idx
  on public.chat_mutes (scope, target_id);
