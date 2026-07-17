# Event ingest — deploy runbook

Pulls concerts / festivals / theatre from partner ticketing sites once a
week and drops them on the map as ordinary MapMeet events (own marker,
own group chat, joinable). First source: **karabas.com** (Ukraine).

## 0. Prerequisites

Apply `supabase/migrations/20260721000000_event_sources.sql`. It adds the
`source*` columns on `events`, the `event_sources` registry (with the
karabas row + its bot profile), `geocode_cache`, and the
`ingest_external_event` / `purge_past_external_events` functions.

Nothing imports until this runs — the function returns a 400 saying so.

## 1. Set the shared secret

The function is deployed `--no-verify-jwt` so `pg_cron` can call it, which
makes this header the only gate in front of a crawl run. Pick any long
random string:

```
supabase secrets set INGEST_SECRET="$(openssl rand -hex 32)"
```

(If `INGEST_SECRET` is unset the gate is skipped — fine locally, not in
production.)

## 2. Deploy

```
supabase functions deploy ingest-events --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 3. Try it before scheduling it

`dryRun` fetches + geocodes and reports what *would* land, writing nothing
except the geocode cache:

```
curl -X POST "https://<project-ref>.functions.supabase.co/ingest-events" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

The response is a per-source summary — `listed`, `pinned` (exact venue →
gets a marker), `cityOnly` (city centroid → Nearby only, no marker),
`skippedNoGeo`, `failed`. Drop `dryRun` to actually import.

Other options: `{"days": 14}` widens the window (default 7, max 31),
`{"source": "karabas"}` runs one source.

**The first run is the slow one.** Nominatim allows ~1 request/second, so
a few hundred venues take a few minutes. Every lookup (including misses)
is cached in `geocode_cache`, so later runs are mostly cache hits.

## 4. Schedule it — Mondays at 00:01

Run once in the SQL editor, substituting your project ref + secret:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'mapmeet-ingest-weekly',
  -- pg_cron runs in UTC. Ukraine is UTC+3 in summer (EEST), so 21:01
  -- Sunday UTC == 00:01 Monday in Kyiv. In winter (EET, UTC+2) this
  -- fires at 23:01 Sunday — change to '1 22 * * 0' if you want 00:01
  -- local year-round.
  '1 21 * * 0',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.functions.supabase.co/ingest-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-ingest-secret', '<INGEST_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
  $$
);
```

Check on it: `select * from cron.job;` /
`select * from cron.job_run_details order by start_time desc limit 5;` /
`select id, last_run_at, last_run_count from public.event_sources;`

To pause a source without redeploying:
`update public.event_sources set enabled = false where id = 'karabas';`

## What lands in the app

- **Marker emoji** — concert 🎤, festival 🎫, theatre 🎭.
- **Tags** — category + city (`концерт`, `львів`), so the existing tag
  search finds "concerts in Lviv" with no extra work.
- **Chat** — on first import the event's chat gets a system message with
  the title, venue, date/time, description and ticket link. Anyone who
  joins sees it as the first message. (`events.image_url` already holds
  the poster for when media messages are wired up; the peek renders it
  today.)
- **Only a week ahead** — the window is today → +7 days.
- **Only what's on screen** — the app never loads a whole country. The
  map fetches imported events for the visible bounds (debounced), and
  Events → Nearby fetches the box around your radius. Joined events are
  always kept, wherever the map is pointing.

## No marker, still findable

Sources publish addresses, not coordinates, so every venue is geocoded:

| resolved            | `geo_precision` | map        | Nearby |
| ------------------- | --------------- | ---------- | ------ |
| the actual venue    | `venue`         | marker     | yes    |
| only the city       | `city`          | **hidden** | yes    |
| nothing             | —               | skipped entirely |  |

A pin on a city centroid would claim the concert is at the town square,
so those events stay off the map and appear in Nearby with the venue text
exactly as the source wrote it. The peek swaps Directions for a "see
venue above" note rather than routing anyone to the centroid.

## Adding another country

1. Write `sources/<site>.ts` exporting an `EventSource` (see
   `karabas.ts`; check the site's robots.txt first and honour its
   crawl-delay).
2. Add it to `sources/registry.ts`.
3. Register it in the DB — the karabas block in the migration is the
   template:
   ```sql
   do $$
   declare v_bot uuid;
   begin
     v_bot := public.ensure_source_bot('<id>', '<Display Name>', '<username>');
     insert into public.event_sources (id, display_name, country, website, bot_profile_id)
     values ('<id>', '<Display Name>', '<CC>', 'https://…', v_bot)
     on conflict (id) do update set bot_profile_id = excluded.bot_profile_id;
   end$$;
   ```

Nothing else changes: the RPC, cron, client and UI are source-agnostic.

## Notes on karabas.com

- `robots.txt` (checked 2026-07-17) allows everything except `/ajax.php*`
  and asks for `Crawl-delay: 1`, which the source honours. Re-check it
  before widening what's fetched.
- We read the site's own schema.org JSON-LD (the metadata it publishes
  for search engines) rather than scraping CSS selectors: it carries
  name, description, poster, ticket URL, start time and the venue's
  postal address, and it survives restyling. Only listing pages are
  fetched — never the per-event pages — so a weekly run is ~9 requests.
- Cancelled events (`eventStatus: EventCancelled`) are dropped.
