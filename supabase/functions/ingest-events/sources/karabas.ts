// MapMeet — karabas.com source (Ukraine).
//
// HOW IT READS THE SITE
//   karabas.com publishes schema.org JSON-LD for every listed event —
//   name, description, image, url, startDate (with offset), the venue
//   Place and its PostalAddress, and the ticket Offer. We read that
//   instead of scraping CSS selectors: it's the site's own machine-
//   readable metadata, it carries everything we need, and it doesn't
//   break when they restyle a card.
//
//   Listings paginate at /concerts/?page=N (also /festivals/, /theatres/)
//   ordered by start date ascending, so we walk pages until we pass the
//   end of the window and stop — a 7-day window costs 2-3 pages per
//   category.
//
// POLITENESS
//   robots.txt (checked 2026-07-17) allows everything except /ajax.php*
//   and asks for Crawl-delay: 1. We only fetch listing pages (never the
//   per-event pages — JSON-LD already has the detail) and sleep 1s
//   between requests.
//
// NOT PUBLISHED BY THE SITE: coordinates. Every event carries a street
// address instead, which is why geocoding (and the venue/city precision
// split) exists a layer up.

import {
  type DateWindow,
  type EventCategory,
  type EventSource,
  type ScrapedEvent,
} from './types.ts';

const BASE = 'https://karabas.com';
const UA =
  'MapMeetBot/1.0 (+https://github.com/Hamuud/mapmeet; community event map; contact via repo)';

/** The site's own taxonomy → our categories. */
const LISTINGS: Array<{ path: string; category: EventCategory }> = [
  { path: '/concerts/', category: 'concert' },
  { path: '/festivals/', category: 'festival' },
  { path: '/theatres/', category: 'theatre' },
];

/** Stop runaway pagination if the site ever reorders results. A week
 *  never needs more than a handful of pages (~100 events each). */
const MAX_PAGES = 12;
const CRAWL_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Json = any;

/** Pull every JSON-LD object out of a page, flattening @graph/arrays. */
function extractJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (item && Array.isArray(item['@graph'])) out.push(...item['@graph']);
        else out.push(item);
      }
    } catch {
      // A single malformed block must not kill the whole run.
    }
  }
  return out;
}

const EVENT_TYPES = new Set([
  'Event',
  'MusicEvent',
  'Festival',
  'TheaterEvent',
  'ScreeningEvent',
  'ComedyEvent',
  'SportsEvent',
]);

function isEventNode(node: Json): boolean {
  const t = node?.['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && EVENT_TYPES.has(x));
}

/** Events also appear nested inside the CollectionPage's ItemList. */
function collectEventNodes(nodes: Json[]): Json[] {
  const found: Json[] = [];
  for (const node of nodes) {
    if (isEventNode(node)) found.push(node);
    const list = node?.mainEntity?.itemListElement;
    if (Array.isArray(list)) {
      for (const li of list) {
        const item = li?.item ?? li;
        if (isEventNode(item)) found.push(item);
      }
    }
  }
  // The same event is emitted both standalone and inside the ItemList.
  const byId = new Map<string, Json>();
  for (const e of found) {
    const id = e['@id'] ?? e.url;
    if (typeof id === 'string') byId.set(id, e);
  }
  return [...byId.values()];
}

/** Split an ISO timestamp into local wall date + time WITHOUT letting
 *  Date() rebase it into UTC — "19:00+03:00" must stay 19:00 on the
 *  marker, because that's the time on the ticket. */
function wallClock(iso: unknown): { date: string; time: string } | null {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

function firstOf(value: Json): Json {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: Json): string | null {
  if (typeof value === 'string') return value.trim() || null;
  return null;
}

/** The site types some listings semantically (a Festival listed under
 *  /concerts/). Trust that over the page it appeared on, then fall back
 *  to the listing's own category. */
function categoryOf(node: Json, listing: EventCategory): EventCategory {
  const t = node?.['@type'];
  const types = (Array.isArray(t) ? t : [t]).filter(
    (x: unknown): x is string => typeof x === 'string',
  );
  if (types.includes('Festival')) return 'festival';
  if (types.includes('TheaterEvent')) return 'theatre';
  if (types.includes('MusicEvent')) return 'concert';
  return listing;
}

function toScraped(node: Json, listing: EventCategory): ScrapedEvent | null {
  const url = text(node.url) ?? text(node['@id']);
  const title = text(node.name);
  const when = wallClock(node.startDate);
  if (!url || !title || !when) return null;

  // Cancelled/postponed events shouldn't send anyone to a venue.
  const status = text(node.eventStatus) ?? '';
  if (/Cancelled|Postponed/i.test(status)) return null;

  const place = firstOf(node.location) ?? {};
  const address = firstOf(place.address) ?? {};
  const offer = firstOf(node.offers) ?? {};
  const image = firstOf(node.image);

  return {
    sourceId: url,
    title,
    description: text(node.description) ?? '',
    category: categoryOf(node, listing),
    date: when.date,
    time: when.time,
    venueName: text(place.name) ?? '',
    streetAddress: text(address.streetAddress),
    city: text(address.addressLocality),
    ticketUrl: text(offer.url) ?? url,
    imageUrl: text(image?.url) ?? text(image),
  };
}

async function fetchPage(path: string, page: number): Promise<string | null> {
  const url = `${BASE}${path}${page > 1 ? `?page=${page}` : ''}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'uk' },
  });
  if (!res.ok) return null;
  return res.text();
}

export const karabasSource: EventSource = {
  id: 'karabas',
  country: 'UA',

  async fetchEvents(window: DateWindow, log): Promise<ScrapedEvent[]> {
    const byId = new Map<string, ScrapedEvent>();

    for (const { path, category } of LISTINGS) {
      let pastWindow = false;

      for (let page = 1; page <= MAX_PAGES && !pastWindow; page++) {
        const html = await fetchPage(path, page);
        await sleep(CRAWL_DELAY_MS); // robots.txt Crawl-delay: 1
        if (!html) {
          log(`${path} page ${page}: fetch failed, stopping this listing`);
          break;
        }

        const nodes = collectEventNodes(extractJsonLd(html));
        if (nodes.length === 0) {
          log(`${path} page ${page}: no events, end of listing`);
          break;
        }

        let kept = 0;
        for (const node of nodes) {
          const ev = toScraped(node, category);
          if (!ev) continue;
          if (ev.date < window.from) continue; // already started
          if (ev.date > window.to) {
            // Listings are date-ascending: everything after this is
            // further out than a week, so stop paging this category.
            pastWindow = true;
            continue;
          }
          if (!byId.has(ev.sourceId)) {
            byId.set(ev.sourceId, ev);
            kept++;
          }
        }
        log(`${path} page ${page}: ${nodes.length} listed, ${kept} in window`);
      }
    }

    return [...byId.values()];
  },
};
