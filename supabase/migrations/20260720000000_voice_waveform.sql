-- =========================================================================
-- MapMeet — voice-note waveforms
-- =========================================================================
-- ~36 amplitude samples (0-100) captured from the mic while recording,
-- rendered as Telegram/WhatsApp-style bars in the audio bubble.
-- Null = recorded before this feature (or metering unavailable) → the
-- client draws a deterministic placeholder wave instead.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.messages
  add column if not exists waveform smallint[];
