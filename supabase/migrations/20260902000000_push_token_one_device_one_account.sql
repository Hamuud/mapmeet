-- A push token identifies a device, not an account.
--
-- The client wrote `profiles.push_token = <token>` on every sign-in and
-- never cleared it on sign-out, so signing into a second account on one
-- phone left both rows holding the same token. Notification targeting
-- was never wrong — event chat goes to that event's participants, a DM
-- resolves to exactly the other side — but a correctly addressed push
-- to an account you have merely *used* on this phone still arrives on
-- it. For a DM that means the preview of somebody's private message on
-- a device that is signed in as someone else.

/*
  Register this device against the caller, and nobody else.

  SECURITY DEFINER because the interesting half is the delete: clearing
  the token from OTHER profiles, which RLS quite rightly will not let a
  user do to rows they do not own. The reasoning that makes it safe is
  that the caller is proving possession of the token by presenting it —
  they are holding the device, so whoever else claims it is stale by
  definition.
*/
create or replace function public.set_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    update public.profiles set push_token = null where id = auth.uid();
    return;
  end if;

  -- Anyone else holding this token was signed in on this device and is
  -- not any more. Must happen before the insert below, or the unique
  -- index rejects it.
  update public.profiles
     set push_token = null
   where push_token = p_token
     and id is distinct from auth.uid();

  update public.profiles set push_token = p_token where id = auth.uid();
end $$;

revoke all on function public.set_push_token(text) from public, anon;
grant execute on function public.set_push_token(text) to authenticated;

-- Repair what is already there. Every copy of a shared token is dropped
-- rather than guessing which account the phone is signed in as now: the
-- device that genuinely holds it re-registers on its next launch, so
-- the live one heals itself within one app open and the stale ones stay
-- silent. Silence for one launch is the right way to be wrong here.
update public.profiles p
   set push_token = null
 where p.push_token is not null
   and exists (
     select 1 from public.profiles q
      where q.push_token = p.push_token and q.id is distinct from p.id
   );

-- And make it unrepeatable. Belt to the function's braces: any code
-- path that tries to write a token another profile still holds now
-- fails loudly instead of quietly doubling it up.
create unique index if not exists profiles_push_token_key
  on public.profiles (push_token)
  where push_token is not null;
