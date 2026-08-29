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

/** PATCH a table with the service key. Returns false rather than
 *  throwing: every caller here is housekeeping, and housekeeping must
 *  never take down the notification it was tidying up after. */
export async function patch(
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
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

  const dead = new Set<string>();
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) continue;
      // One ticket per message, in the order sent. Expo echoes the
      // offending token back in details.expoPushToken, so prefer that
      // over the index — it survives Expo ever reordering or collapsing
      // tickets, which positional matching silently would not.
      const tickets: any[] = (await res.json())?.data ?? [];
      tickets.forEach((ticket, j) => {
        if (ticket?.details?.error !== 'DeviceNotRegistered') return;
        const token = ticket.details.expoPushToken ?? chunk[j]?.to;
        if (token) dead.add(token);
      });
    } catch {
      // Expo unreachable. Nothing to learn from this batch; the next
      // notification will find out the same thing.
    }
  }
  await forgetTokens(dead);
}

/** Drop tokens Expo has told us are dead.
 *
 *  `DeviceNotRegistered` means the app was uninstalled, or the token was
 *  reissued — the device will never receive on it again. Only that
 *  error: MessageRateExceeded and MessageTooBig say something about this
 *  send, not about the device, and clearing on those would silently
 *  unsubscribe people for being popular.
 *
 *  Nulling is safe because it is self-healing — the client re-registers
 *  on the next launch, so a user who reinstalls gets a fresh token
 *  rather than a permanently silent account. Matching on the token
 *  rather than a user id also clears it from every profile that shares
 *  it, which is what you want when two accounts have used one phone. */
async function forgetTokens(tokens: Set<string>) {
  for (const token of tokens) {
    await patch(`profiles?push_token=eq.${encodeURIComponent(token)}`, {
      push_token: null,
    });
  }
}

/** Which room a notification belongs to, so anyone who has muted that
 *  one specifically can be dropped. Omitted for notifications that
 *  belong to no room — a friend request, an event being moved. */
export type MuteScope = { scope: 'event' | 'dm' | 'group'; targetId: string };

/** Profiles → recipients, filtered by a per-category opt-out column and,
 *  when the notification belongs to a conversation, by whether the
 *  recipient has muted that conversation.
 *
 *  Anyone banned, tokenless, opted out of the category, or muted on this
 *  room simply drops out of the list. */
export async function recipientsFor(
  userIds: Iterable<string>,
  category: 'push_chat' | 'push_joins' | 'push_events' | 'push_social',
  mute?: MuteScope,
): Promise<Recipient[]> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return [];

  // Asked as one query for the whole room rather than per recipient, and
  // narrowed to the ids we already care about so a popular chat does not
  // drag back every mute anyone ever set on it.
  let muted = new Set<string>();
  if (mute) {
    const rows = await rest(
      `chat_mutes?scope=eq.${mute.scope}&target_id=eq.${mute.targetId}` +
        `&user_id=in.(${ids.join(',')})&select=user_id`,
    );
    muted = new Set(rows.map((r) => r.user_id as string));
  }

  const rows = await rest(
    `profiles?id=in.(${ids.join(',')})&select=id,push_token,locale,banned_at,${category}`,
  );
  return rows
    .filter(
      (p) =>
        p[category] !== false &&
        !p.banned_at &&
        !muted.has(p.id as string) &&
        isPushToken(p.push_token),
    )
    .map((p) => ({ token: p.push_token as string, locale: asLocale(p.locale) }));
}
