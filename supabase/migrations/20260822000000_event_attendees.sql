-- MapMeet — who else is going, answered before you commit.
--
-- The event sheet showed six avatars and a +N. The full list existed but
-- lived inside the event chat, which is members-only, so the honest
-- summary was: you can see who is going once you have already decided to
-- go. That is backwards. Who else is coming is the main thing anybody
-- weighs about meeting strangers.
--
-- Two things this function does that a plain select on `participants`
-- cannot:
--
--  1. It honours `attending_visibility`. Somebody who set "nobody can see
--     what I'm attending" should not be listed on the events they joined
--     — the six-avatar row has been leaking exactly that, and widening it
--     to a full list would have made a small leak into an obvious one.
--     'friends' means friends of the viewer only. Viewers always see
--     themselves.
--
--  2. It marks friends, so the sheet can lead with "two friends are
--     going" — the one line that moves people more than any other on a
--     page like this.
--
-- The visible list is therefore sometimes shorter than participant_count,
-- which stays truthful. "12 going" above eight faces is the correct
-- reading of somebody else's privacy choice, not a bug.

create or replace function public.event_attendees(
  p_event_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  is_friend boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role::text,
         public.is_friend(auth.uid(), p.id) as is_friend
    from public.participants pa
    join public.profiles p on p.id = pa.user_id
   where pa.event_id = p_event_id
     and auth.uid() is not null
     -- Never list someone who has blocked the viewer, or whom the viewer
     -- has blocked: the rest of the app already hides them from each
     -- other and an attendee list should not be the exception. Spelled
     -- out in both directions rather than trusting one helper to be
     -- symmetric.
     and not public.is_blocked(auth.uid(), p.id)
     and not public.is_blocked(p.id, auth.uid())
     and (
       p.id = auth.uid()
       or coalesce(p.attending_visibility, 'everyone') = 'everyone'
       or (p.attending_visibility = 'friends'
           and public.is_friend(auth.uid(), p.id))
     )
   -- Friends first, then whoever joined earliest: the useful order for
   -- deciding, not the order the rows happen to be in.
   order by public.is_friend(auth.uid(), p.id) desc, pa.joined_at asc
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.event_attendees(uuid, int) from anon;

comment on function public.event_attendees(uuid, int) is
  'Attendees of an event, filtered by each one''s attending_visibility and by blocks, friends first, flagged with is_friend.';
