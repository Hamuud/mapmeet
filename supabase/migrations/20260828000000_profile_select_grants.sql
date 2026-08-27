-- =========================================================================
-- MapMeet — SECURITY: stop `anon` reading every column of every profile
-- =========================================================================
-- 20260815000000 fixed WRITES to profiles with column-level privileges.
-- It never touched SELECT, and the read side was worse than the write
-- side ever was, because it needs no account at all:
--
--   curl "$URL/rest/v1/profiles?select=username,digest_lat,digest_lng" \
--        -H "apikey: $ANON_KEY"
--
-- returns every user, because the "profiles are readable by everyone"
-- policy is granted to PUBLIC and `anon` holds SELECT on all columns.
-- Confirmed against the live database before writing this.
--
-- What was exposed, in descending order of how much it matters:
--
--   digest_lat, digest_lng  — the coordinates each person set for their
--                             area digest. In practice: where they live.
--   push_token              — a handle for pushing notifications to that
--                             specific device.
--   phone
--   muted_until, banned_at,
--   warning_count           — a public list of who has been moderated.
--   digest_last_sent_at,
--   last_seen_at, tz_offset — activity and rough timezone.
--
-- The anon key is not a secret — it ships inside the web bundle at
-- hamuud.github.io/mapmeet, so "you need the key" is not a mitigation.
--
-- THE FIX
--   Revoke SELECT wholesale from anon, then grant back exactly the five
--   columns that are already public in the UI: they appear on every
--   event card and every pin. Nothing else.
--
-- ⚠ NOT FIXED HERE, and it should be next: `authenticated` still holds
--   SELECT on all of the above for EVERY row, so any signed-in account
--   can read any other user's home coordinates and push token. Narrowing
--   that means auditing every `select('*')` against profiles first —
--   real work, and not something to bundle into a security patch that
--   needs to land now. The anon hole is the one that needs no account.
--
-- Idempotent: safe to re-run.
-- =========================================================================

revoke select on public.profiles from anon;

-- The public face of an account: what a pin, an event card and a host
-- byline already show to anybody who can see the event.
--   role is included because the map styles pins by it — a premium or
--   designer host renders differently, and that is public by design.
grant select (
  id,
  username,
  display_name,
  avatar_url,
  role
) on public.profiles to anon;

-- Deliberately NOT granted to anon, each for its own reason:
--   digest_lat, digest_lng   — home location
--   push_token               — a channel straight to their device
--   phone                    — contact detail
--   banned_at, muted_until,
--   warning_count, is_admin  — moderation state is nobody else's business
--   bio, interests           — shown on a profile page, which is behind
--                              the sign-in wall; no reason to pre-leak it
--   locale, tz_offset_minutes,
--   last_seen_at,
--   digest_last_sent_at      — activity fingerprinting
--   onboarding_complete,
--   age_confirmed,
--   attending_visibility     — account state, not public information
--   created_at, updated_at
