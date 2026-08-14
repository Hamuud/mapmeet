// MapMeet — scheduled pushes (Supabase Edge Function).
//
// Invoked by pg_cron, not by a webhook. Two independent sweeps:
//
//   reminders  every 15 min — "⏰ Rooftop cinema / Starts in 40 min"
//                             to everyone attending
//   digest     hourly       — "12 new events have been pinned in your
//                             area" to people who have not opened the
//                             app for a day
//
// The digest runs hourly rather than daily because "daytime" is the
// recipient's daytime: the SQL only returns people whose local clock is
// between 10:00 and 21:00, so an hourly sweep catches each timezone as
// it comes round. Everything that decides *whether* to send lives in
// digest_audience() — this function only renders and posts.
//
// Deploy:  supabase functions deploy digest --no-verify-jwt
// Secret:  DIGEST_SECRET (same shape as the ingest function's)

// deno-lint-ignore-file no-explicit-any
import { asLocale, rpc, sendPush, type Recipient } from '../_shared/push.ts';
import { t } from '../_shared/strings.ts';

const SECRET = Deno.env.get('DIGEST_SECRET') ?? '';
/** Below this, a digest is not worth a notification. */
const MIN_EVENTS = 5;

async function runReminders(): Promise<number> {
  const rows: any[] = (await rpc('due_event_reminders', { p_window_minutes: 75 })) ?? [];
  if (rows.length === 0) return 0;

  // One push per event, to everyone attending it.
  const byEvent = new Map<string, { row: any; to: Recipient[] }>();
  for (const r of rows) {
    let entry = byEvent.get(r.event_id);
    if (!entry) {
      entry = { row: r, to: [] };
      byEvent.set(r.event_id, entry);
    }
    entry.to.push({ token: r.push_token, locale: asLocale(r.locale) });
  }

  for (const [eventId, { row, to }] of byEvent) {
    const minutes = Math.max(
      0,
      Math.round((new Date(row.starts_at).getTime() - Date.now()) / 60000),
    );
    await sendPush(
      to,
      (locale) => ({
        title: t(locale, 'remindTitle', { emoji: row.emoji, title: row.title }),
        body:
          minutes <= 5
            ? t(locale, 'remindNow')
            : t(locale, 'remindSoon', { minutes }),
      }),
      { kind: 'event_reminder', eventId },
    );
  }

  // Marked only after Expo has taken them, so a failed sweep retries
  // rather than silently skipping an event.
  await rpc('mark_reminders_sent', { p_events: [...byEvent.keys()] });
  return byEvent.size;
}

async function runDigest(): Promise<number> {
  const rows: any[] = (await rpc('digest_audience', { p_min_events: MIN_EVENTS })) ?? [];
  if (rows.length === 0) return 0;

  // The count differs per person, so these can't share one render.
  for (const r of rows) {
    const count = r.new_events as number;
    await sendPush(
      [{ token: r.push_token, locale: asLocale(r.locale) }],
      (locale) => ({
        title: t(locale, 'digestTitle'),
        body: t(locale, 'digestBody', { count }),
      }),
      { kind: 'digest' },
    );
  }

  await rpc('mark_digest_sent', { p_users: rows.map((r) => r.user_id) });
  return rows.length;
}

Deno.serve(async (req) => {
  if (SECRET && req.headers.get('x-digest-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const url = new URL(req.url);
    // ?job=reminders | digest | both (default)
    const job = url.searchParams.get('job') ?? 'both';
    const out: Record<string, number> = {};
    if (job === 'reminders' || job === 'both') out.reminders = await runReminders();
    if (job === 'digest' || job === 'both') out.digest = await runDigest();
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
