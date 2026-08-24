// MapMeet — pull the caller's subscription state from RevenueCat.
//
// The webhook is the fast path; this is the one that makes the system
// self-correcting. It exists for four situations the webhook cannot
// cover on its own:
//
//   1. A delivery was lost. `entitled_until` means a missed RENEWAL
//      quietly locks a PAYING customer out — the safe direction, but
//      only if something repairs it. This is that something.
//   2. Restore Purchases: a new device, or a reinstall.
//   3. The purchase completed while RevenueCat still had an anonymous
//      id for the buyer, so the webhook had no account to write to.
//   4. First launch after signing in on a second device.
//
// The client calls it; the SERVER asks RevenueCat. That direction is the
// whole point — a client that could assert its own entitlement could
// grant itself premium, so nothing in the request body is trusted. The
// only input is the caller's JWT.
//
// Deploy:  supabase functions deploy subscription-sync
//          (JWT verification ON here — unlike the webhook, the caller
//           IS a signed-in user and their identity is the input.)
// Secret:  REVENUECAT_SECRET_KEY — a RevenueCat **secret** API key
//          (sk_…), not the public SDK key that ships in the app.

// deno-lint-ignore-file no-explicit-any
import {
  applyEntitlement,
  ENTITLEMENT,
  isUserId,
} from '../_shared/subscriptions.ts';

const RC_KEY = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Who is calling? Resolved from the bearer token against Supabase Auth
 *  rather than from anything in the body. */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return isUserId(user?.id) ? user.id : null;
}

Deno.serve(async (req) => {
  // Identity first, configuration second: an anonymous caller should
  // learn nothing about how this project is set up, not even whether
  // billing keys exist.
  const userId = await callerId(req);
  if (!userId) return json({ error: 'not signed in' }, 401);

  if (!RC_KEY) return json({ error: 'not configured' }, 500);

  // RevenueCat's subscriber endpoint is keyed on app_user_id, which the
  // client sets to the Supabase user id via Purchases.logIn(). That
  // identity link is the entire mapping between the two systems.
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } },
  );

  if (res.status === 404) {
    // RevenueCat has never heard of them: they have never purchased.
    // Not an error, and not a reason to revoke anything either — a
    // 404 here would otherwise wipe a comped or staff account.
    return json({ active: false, known: false });
  }
  if (!res.ok) {
    return json({ error: `revenuecat ${res.status}` }, 502);
  }

  const body: any = await res.json();
  const ent = body?.subscriber?.entitlements?.[ENTITLEMENT];

  if (!ent) {
    // Known to RevenueCat but holding no premium entitlement. This DOES
    // revoke — it is the authoritative answer to "should this account
    // have premium", and it is how a refund or an expiry that we never
    // got the webhook for finally lands.
    await applyEntitlement({
      userId,
      store: null,
      productId: null,
      rcAppUserId: userId,
      status: 'expired',
      entitledUntil: new Date().toISOString(),
      willRenew: false,
      environment: 'production',
    });
    return json({ active: false, known: true });
  }

  const expires: string | null = ent.expires_date ?? null;
  const productId: string | null = ent.product_identifier ?? null;
  const sub = productId ? body?.subscriber?.subscriptions?.[productId] : null;

  const active = !!expires && Date.parse(expires) > Date.now();
  const willRenew = !sub?.unsubscribe_detected_at && !sub?.billing_issues_detected_at;

  await applyEntitlement({
    userId,
    store: (sub?.store ?? null)?.toLowerCase?.() ?? null,
    productId,
    rcAppUserId: userId,
    status: active
      ? sub?.billing_issues_detected_at
        ? 'billing_issue'
        : sub?.unsubscribe_detected_at
          ? 'cancelled'
          : 'active'
      : 'expired',
    entitledUntil: expires,
    willRenew,
    environment: sub?.is_sandbox ? 'sandbox' : 'production',
  });

  return json({ active, known: true, entitledUntil: expires, willRenew });
});
