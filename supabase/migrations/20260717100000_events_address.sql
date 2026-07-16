-- =========================================================================
-- MapMeet — human-readable venue on events
-- =========================================================================
-- Events only stored lat/lng; the chat's pinned banner (and, later, the
-- peek) wants "Library" / "Kino Pod Baranami" style venue text. Store
-- the label the host picked in the address search at create/edit time.
-- Existing rows stay NULL — the client reverse-geocodes as a fallback.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.events
  add column if not exists address text
    check (address is null or char_length(address) <= 200);
