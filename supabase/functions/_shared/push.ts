// MapMeet — shared push helpers for the notify + digest functions.
//
// Two things live here because both functions need them and drifting
// copies would mean a notification that is localised in one place and
// not the other.
//
// deno-lint-ignore-file no-explicit-any

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
/** Expo rejects batches larger than this. */
const EXPO_BATCH = 100;

export type Locale = 'en' | 'uk';

export type Recipient = { token: string; locale: Locale };

export async function rest(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/** Call a SECURITY DEFINER RPC with the service key. */
export async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function isPushToken(t: unknown): t is string {
  return typeof t === 'string' && t.startsWith('ExponentPushToken');
}

export function asLocale(v: unknown): Locale {
  return v === 'uk' ? 'uk' : 'en';
}

/** Ukrainian needs three forms where English needs two. Mirrors
 *  `pluralCategory` in i18n/types.ts — keep the two in step. */
export function plural(locale: Locale, n: number): 'one' | 'few' | 'other' {
  const abs = Math.abs(n);
  if (locale === 'en') return abs === 1 ? 'one' : 'other';
  if (!Number.isInteger(abs)) return 'other';
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'other';
}

export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (whole, k: string) =>
    k in vars ? String(vars[k]) : whole,
  );
}

/** Post to Expo, chunked. Recipients carry their own locale, so the
 *  caller renders the body per language rather than shipping English to
 *  everyone — the app is bilingual and a push is the one place a user
 *  cannot switch language after the fact. */
export async function sendPush(
  recipients: Recipient[],
  render: (locale: Locale) => { title: string; body: string },
  data: Record<string, unknown>,
) {
  if (recipients.length === 0) return;
  const rendered = new Map<Locale, { title: string; body: string }>();
  const messages = recipients.map((r) => {
    let m = rendered.get(r.locale);
    if (!m) {
      m = render(r.locale);
      rendered.set(r.locale, m);
    }
    return { to: r.token, title: m.title, body: m.body, data, sound: 'default' };
  });

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + EXPO_BATCH)),
    });
  }
}

/** Profiles → recipients, filtered by a per-category opt-out column.
 *  Anyone banned, tokenless or opted out simply drops out of the list. */
export async function recipientsFor(
  userIds: Iterable<string>,
  category: 'push_chat' | 'push_joins' | 'push_events' | 'push_social',
): Promise<Recipient[]> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await rest(
    `profiles?id=in.(${ids.join(',')})&select=push_token,locale,banned_at,${category}`,
  );
  return rows
    .filter((p) => p[category] !== false && !p.banned_at && isPushToken(p.push_token))
    .map((p) => ({ token: p.push_token as string, locale: asLocale(p.locale) }));
}
