// MapMeet — shared subscription writing, used by both the RevenueCat
// webhook (push) and the sync function (pull).
//
// Both paths end in the same two steps: write the entitlement row, then
// bring profiles.role back in step. Keeping that in one place is what
// stops the pull path from slowly disagreeing with the push path.

// deno-lint-ignore-file no-explicit-any

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The RevenueCat entitlement that means "premium". Must match the
 *  identifier configured in the RevenueCat dashboard exactly. */
export const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium';

export type Entitlement = {
  userId: string;
  store: string | null;
  productId: string | null;
  rcAppUserId: string | null;
  status: string;
  /** Access ends at this instant. Null revokes immediately. */
  entitledUntil: string | null;
  willRenew: boolean;
  environment: string;
};

async function sb(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Postgres RPC with the service key. */
export async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json().catch(() => null);
}

/** Does this look like a uuid? RevenueCat's app_user_id is whatever the
 *  client set, and before Purchases.logIn() runs it is an anonymous id
 *  of the form `$RCAnonymousID:abc123`. Writing that into a uuid column
 *  is a 400; worse, treating it as an account would be a silent grant to
 *  nobody. Anonymous events are dropped on purpose — the purchase is
 *  re-linked by the sync call once the app knows who is signed in. */
export function isUserId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/** Upsert the entitlement, then re-derive the role.
 *
 *  Order matters: sync_premium_role() reads the subscriptions table for
 *  its answer, so the row has to land first. */
export async function applyEntitlement(e: Entitlement): Promise<void> {
  const res = await sb(
    'POST',
    'subscriptions',
    {
      user_id: e.userId,
      entitlement: ENTITLEMENT,
      store: e.store,
      product_id: e.productId,
      rc_app_user_id: e.rcAppUserId,
      status: e.status,
      entitled_until: e.entitledUntil,
      will_renew: e.willRenew,
      environment: e.environment,
      current_period_end: e.entitledUntil,
      updated_at: new Date().toISOString(),
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' },
  );
  if (!res.ok) {
    throw new Error(`subscriptions upsert: ${res.status} ${await res.text()}`);
  }

  await rpc('sync_premium_role', { p_user: e.userId });
}

/** Record the delivery. The unique index on event_id is the idempotency
 *  guard — a RevenueCat retry conflicts here and we stop, rather than
 *  re-applying an entitlement that may since have been superseded by a
 *  later event. Returns false when this event has already been seen. */
export async function recordEvent(
  eventId: string | null,
  userId: string | null,
  type: string,
  store: string | null,
  payload: unknown,
): Promise<boolean> {
  if (!eventId) return true; // nothing to dedupe on; let it through
  const res = await sb('POST', 'subscription_events', {
    event_id: eventId,
    user_id: userId,
    type,
    store,
    payload,
  }, { Prefer: 'return=minimal' });
  if (res.status === 409) return false; // duplicate delivery
  if (!res.ok) {
    throw new Error(`subscription_events: ${res.status} ${await res.text()}`);
  }
  return true;
}

export function msToIso(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}
