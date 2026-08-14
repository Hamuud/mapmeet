-- =========================================================================
-- MapMeet — SECURITY: clients may only write the profile columns they own
-- =========================================================================
-- The "users can update their own profile" policy is row-level, which is
-- all RLS can express. It was written when profiles held nothing but a
-- name and an avatar; role, is_admin, banned_at, muted_until and
-- warning_count were all added later, on top of it. The result:
--
--   supabase.from('profiles').update({ role: 'owner', is_admin: true })
--
-- from any signed-in client made that user the owner — full moderation
-- access, the ability to assign roles, and the ability to read every
-- report. The same call could clear the caller's own ban, mute and
-- warning count. Confirmed against the live database before this ran.
--
-- RLS cannot fix it: a policy gates rows, not columns. Postgres
-- column-level privileges can, and they compose with the policy —
-- a write must now satisfy BOTH.
--
-- Everything a user genuinely owns stays writable. Everything that
-- describes what the system thinks of them becomes writable only by the
-- SECURITY DEFINER RPCs that already gate it: assign_role() for roles,
-- admin_moderate_user() for bans and mutes.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- Wholesale UPDATE goes away for both client roles...
revoke update on public.profiles from authenticated, anon;

-- ...and comes back only for the columns the client writes directly:
-- the profile editor (profiles.service.update) and push registration.
-- Nothing else in the app issues a bare UPDATE against this table.
grant update (
  username,
  display_name,
  avatar_url,
  bio,
  phone,
  interests,
  push_token
) on public.profiles to authenticated;

-- `anon` has no business writing a profile at all; INSERT stays with
-- authenticated (the signup trigger runs as definer and is unaffected).
revoke insert on public.profiles from anon;

-- Deliberately NOT granted, and the reason for each:
--   id                — repointing a row at another user
--   role, is_admin    — privilege escalation; use assign_role()
--   banned_at,
--   muted_until,
--   warning_count     — self-unbanning; use admin_moderate_user()
--   created_at,
--   updated_at        — updated_at is maintained by a trigger, which
--                       runs as the table owner and is unaffected
--   last_seen_at      — written by touch_last_seen()
--   attending_visibility — written by set_attending_visibility()
--
-- The last two are worth spelling out: both are legitimately user-owned,
-- but both already go through SECURITY DEFINER RPCs, and a definer
-- function runs as its owner and is not subject to these grants. So they
-- keep working untouched, and the client still cannot forge them by
-- writing the table directly.
