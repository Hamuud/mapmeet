-- =========================================================================
-- MapMeet — stop clients enumerating storage buckets
-- =========================================================================
-- Every bucket shipped with a broad
--     SELECT on storage.objects USING (bucket_id = '<bucket>')
-- granted to the `public` role. On a PUBLIC bucket that policy buys
-- nothing (the CDN path /storage/v1/object/public/... needs no policy)
-- but it does let ANY client — including signed-out ones — call
-- storage.list() and walk the entire bucket: every voice note, chat
-- photo, avatar and feedback attachment, with their paths.
--
-- Dropping these policies removes enumeration. Existing media keeps
-- working because the app only ever calls `getPublicUrl()`, which
-- constructs the public CDN URL client-side and never touches
-- storage.objects RLS.
--
-- NOTE: this does not make the objects secret — a public bucket serves
-- any URL that's known. The URLs are unguessable (uuid paths) and only
-- handed out through RLS-protected message rows, so they act as
-- capability tokens. Flipping the buckets to private + signed URLs is
-- the stronger option and is tracked separately: it needs the stored
-- media_url values migrated to paths.
--
-- Idempotent: safe to re-run.
-- =========================================================================

drop policy if exists "public read on avatars"       on storage.objects;
drop policy if exists "public read on chat media"    on storage.objects;
drop policy if exists "public read on feedback media" on storage.objects;
