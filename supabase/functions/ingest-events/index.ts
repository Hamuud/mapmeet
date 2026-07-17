// MapMeet — weekly event ingest (Supabase Edge Function).
//
// WHAT IT DOES, once a week (see supabase/functions/README.md for the
// cron snippet):
//   for each enabled source in public.event_sources
//     → fetch everything it lists starting in the next 7 days
//     → geocode each venue (cached; venue-precision pins, city-precision
//       stays off the map but stays findable in Nearby)
//     → upsert via ingest_external_event(), which also posts the event's
//       details into its chat on first insert
//   then purge past imported events nobody joined.
//
// Safe to run by hand any time: every step is an upsert keyed on
// (source, source_id), so re-running refreshes rather than duplicates.
//
// Deploy: supabase functions deploy ingest-events --no-verify-jwt
// Invoke: POST with header `x-ingest-secret: <INGEST_SECRET>`
//         optional body: { "dryRun": true, "days": 7, "source": "karabas" }

import { restGet, restPatch, rpc } from './db.ts';
import { geocodeVenue } from './geocode.ts';
import { sourceById, SOURCES } from './sources/registry.ts';
import { CATEGORY_EMOJI, CATEGORY_TAG, type ScrapedEvent } from './sources/types.ts';

const INGEST_SECRET = Deno.env.get('INGEST_SECRET') ?? '';
const DEFAULT_DAYS = 7; // "only parse a week in advance"

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Tags must satisfy the DB's `^\S{2,24}$` check: no whitespace, 2-24
 *  chars. Lowercase, spaces → hyphens, strip anything that can't sit in
 *  a tag, then bound the length. */
function normalizeTag(raw: string): string | null {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/["'`«»]/g, '')
    .slice(0, 24);
  return t.length >= 2 ? t : null;
}

/** Location tag + category tag — "concerts in Lviv" becomes findable by
 *  the existing tag search with no extra plumbing. */
function tagsFor(ev: ScrapedEvent): string[] {
  const tags = [CATEGORY_TAG[ev.category]];
  const city = ev.city ? normalizeTag(ev.city) : null;
  if (city && !tags.includes(city)) tags.push(city);
  return tags.map(normalizeTag).filter((t): t is string => !!t);
}

/** Venue line shown on the peek and in the chat: the venue as the source
 *  named it, plus the street when we have it. This is what the user sees
 *  for city-precision events that never get a marker, so it has to carry
 *  the site's own wording. */
function addressFor(ev: ScrapedEvent): string {
  const parts = [ev.venueName, ev.streetAddress].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  const seen = new Set<string>();
  return parts.filter((p) => !seen.has(p) && seen.add(p)).join(' · ').slice(0, 200);
}

type SourceRow = {
  id: string;
  country: string;
  enabled: boolean;
};

type Summary = {
  source: string;
  listed: number;
  imported: number;
  pinned: number;
  cityOnly: number;
  skippedNoGeo: number;
  failed: number;
  errors: string[];
};

async function runSource(
  row: SourceRow,
  days: number,
  dryRun: boolean,
  log: (m: string) => void,
): Promise<Summary> {
  const summary: Summary = {
    source: row.id,
    listed: 0,
    imported: 0,
    pinned: 0,
    cityOnly: 0,
    skippedNoGeo: 0,
    failed: 0,
    errors: [],
  };

  const source = sourceById(row.id);
  if (!source) {
    summary.errors.push(`no module registered for source "${row.id}"`);
    return summary;
  }

  const now = new Date();
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + days);
  const window = { from: isoDate(now), to: isoDate(to) };
  log(`[${row.id}] window ${window.from} → ${window.to}`);

  const events = await source.fetchEvents(window, log);
  summary.listed = events.length;
  log(`[${row.id}] ${events.length} events in window`);

  for (const ev of events) {
    try {
      const geo = await geocodeVenue({
        streetAddress: ev.streetAddress,
        venueName: ev.venueName,
        city: ev.city,
        country: source.country === 'UA' ? 'Україна' : source.country,
      });

      // No coordinates at all → we can't place it on the map and can't
      // answer "is it near me?" either. Dropping it is the honest call.
      if (!geo) {
        summary.skippedNoGeo++;
        continue;
      }
      if (geo.precision === 'venue') summary.pinned++;
      else summary.cityOnly++;

      if (dryRun) {
        summary.imported++;
        continue;
      }

      await rpc<string>('ingest_external_event', {
        p_source: row.id,
        p_source_id: ev.sourceId,
        p_title: ev.title,
        p_description: ev.description,
        p_emoji: CATEGORY_EMOJI[ev.category],
        p_latitude: geo.latitude,
        p_longitude: geo.longitude,
        p_address: addressFor(ev),
        p_event_date: ev.date,
        p_event_time: ev.time,
        p_tags: tagsFor(ev),
        p_source_url: ev.ticketUrl,
        p_image_url: ev.imageUrl,
        p_geo_precision: geo.precision,
      });
      summary.imported++;
    } catch (e) {
      summary.failed++;
      // Keep going: one bad event must not sink the week's run.
      if (summary.errors.length < 5) {
        summary.errors.push(`${ev.sourceId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (!dryRun) {
    await restPatch(`event_sources?id=eq.${row.id}`, {
      last_run_at: new Date().toISOString(),
      last_run_count: summary.imported,
    });
  }
  return summary;
}

Deno.serve(async (req) => {
  // Shared-secret gate: the function is deployed with --no-verify-jwt so
  // pg_cron can call it, which means this header is the only thing
  // standing between the internet and a crawl run.
  if (INGEST_SECRET && req.headers.get('x-ingest-secret') !== INGEST_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    console.log(m);
  };

  let body: { dryRun?: boolean; days?: number; source?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body — cron posts empty. Defaults are the weekly behaviour.
  }
  const days = Math.min(Math.max(body.days ?? DEFAULT_DAYS, 1), 31);
  const dryRun = body.dryRun === true;

  try {
    const rows =
      (await restGet<SourceRow[]>('event_sources?enabled=eq.true&select=id,country,enabled')) ?? [];
    const active = rows.filter((r) => (body.source ? r.id === body.source : true));

    if (active.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'no enabled sources found — apply migration 20260721000000_event_sources.sql first',
          registered: SOURCES.map((s) => s.id),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const summaries = [];
    for (const row of active) {
      summaries.push(await runSource(row, days, dryRun, log));
    }

    const purged = dryRun ? 0 : ((await rpc<number>('purge_past_external_events', {})) ?? 0);

    return new Response(
      JSON.stringify({ ok: true, dryRun, days, purged, summaries, logs }, null, 2),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), logs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
