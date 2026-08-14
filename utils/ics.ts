import { eventStart } from './eventTime';

/** How long a MapMeet event is assumed to run.
 *
 *  The schema has a start and no end — nobody pins a coffee and fills in
 *  a finish time. Two hours is long enough that the block reads as "my
 *  evening is spoken for" and short enough not to swallow the day. It is
 *  also what the device calendar entry uses, so the two agree. */
export const DEFAULT_EVENT_HOURS = 2;

export type CalendarEventInput = {
  id: string;
  title: string;
  emoji: string;
  description?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  event_date: string;
  event_time: string;
};

export function eventEnd(start: Date): Date {
  return new Date(start.getTime() + DEFAULT_EVENT_HOURS * 3600_000);
}

/** What goes in the calendar entry's location field. The venue name when
 *  the address search gave us one, otherwise coordinates — which every
 *  maps app will still resolve into a pin. */
export function calendarLocation(e: CalendarEventInput): string {
  return e.address?.trim()
    ? e.address.trim()
    : `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`;
}

export function calendarTitle(e: CalendarEventInput): string {
  return `${e.emoji} ${e.title}`.trim();
}

/** UTC basic format: 20260820T170000Z. */
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Fold a finished `NAME:value` line at 75 octets (RFC 5545 §3.1).
 *  Long descriptions and Cyrillic venue names both hit this, and an
 *  unfolded line is the most common reason an .ics is rejected without
 *  explanation. */
function fold(line: string): string {

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    // 75 octets per line; continuations start with one space, which
    // counts toward the next line's budget.
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  if (current) out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n');
}

/** A TEXT-valued property: escape per §3.3.11, then fold. */
function icsLine(name: string, value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
  return fold(`${name}:${escaped}`);
}

/** A property whose value is structured rather than TEXT — GEO is
 *  `lat;lon`, and that semicolon is the separator, not a character to
 *  escape. Escaping it produces `GEO:49.55\;25.59`, which parsers
 *  either reject or read as a single malformed coordinate. */
function icsRawLine(name: string, value: string): string {
  return fold(`${name}:${value}`);
}

/** A single-event iCalendar file.
 *
 *  This is the whole calendar story on web, where expo-calendar does not
 *  exist — and it is a decent one: an .ics opens in Google Calendar,
 *  Apple Calendar and Outlook alike, and the UID means importing twice
 *  updates the entry instead of duplicating it. */
export function buildIcs(e: CalendarEventInput): string {
  const start = eventStart(e);
  if (!start) throw new Error('Event has no valid start time.');
  const end = eventEnd(start);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AlyaskaTeam//MapMeet//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    icsLine('UID', `mapmeet-${e.id}@mapmeet.app`),
    icsLine('DTSTAMP', icsStamp(new Date())),
    icsLine('DTSTART', icsStamp(start)),
    icsLine('DTEND', icsStamp(end)),
    icsLine('SUMMARY', calendarTitle(e)),
    icsLine('LOCATION', calendarLocation(e)),
    icsRawLine('GEO', `${e.latitude};${e.longitude}`),
  ];
  if (e.description?.trim()) {
    lines.push(icsLine('DESCRIPTION', e.description.trim()));
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  // CRLF is not optional in RFC 5545, and Outlook is the one that cares.
  return lines.join('\r\n') + '\r\n';
}

/** Filename for the downloaded .ics — the title, made safe for a
 *  filesystem, with a sensible fallback. */
export function icsFilename(e: CalendarEventInput): string {
  const safe = e.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40);
  return `${safe || 'mapmeet-event'}.ics`;
}
