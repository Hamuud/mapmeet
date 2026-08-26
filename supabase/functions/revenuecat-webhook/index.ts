// MapMeet — RevenueCat webhook (Supabase Edge Function).
//
// RevenueCat owns the messy part: validating App Store / Play Store
// receipts, and running the renewal → billing-retry → grace → expiry
// state machine. This endpoint is told the outcome and writes it down.
//
// Deploy:  supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secret:  REVENUECAT_WEBHOOK_SECRET — paste the SAME string into the
//          RevenueCat dashboard's webhook "Authorization header value".
//
// The secret is the only thing between this URL and anyone who wants to
// hand themselves a free subscription: the body is a dozen lines of JSON
// and the URL is public. JWT verification is NOT a substitute — Supabase
// accepts any correctly signed token and the anon key is one, published
// inside the web bundle. Hence --no-verify-jwt plus this check.
//
// EVENT TYPES, and why they map the way they do
//
//   INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE /
//   SUBSCRIPTION_EXTENDED / NON_RENEWING_PURCHASE
//       → entitled until the period end the store just told us.
//
//   CANCELLATION
//       → auto-renew is OFF. Access is untouched: somebody who cancels
//         on day 3 has paid for the month, and taking it away then is a
//         refund request and a one-star review. The store agrees — this
//         is exactly how Apple's own state machine behaves.
//
//   BILLING_ISSUE
//       → the card failed. Apple retries for up to ~60 days and, if a
//         billing grace period is configured, keeps the subscriber
//         entitled meanwhile. Entitlement runs to whichever of the two
//         timestamps is later.
//
//   EXPIRATION
//       → access ends. This is the only event that revokes, and it
//         covers voluntary lapse, failed billing, and refunds alike
//         (cancel_reason says which).
//
//   TRANSFER
//       → the subscription moved between accounts (Family Sharing, or a
//         restore onto a different login). Revoke from every id it left,
//         grant to every id it arrived at.
//
// Anything else is logged and ignored rather than guessed at.

// deno-lint-ignore-file no-explicit-any
import {
  applyEntitlement,
  ENTITLEMENT,
  isUserId,
  msToIso,
  recordEvent,
} from '../_shared/subscriptions.ts';

const SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

const ok = (why = 'ok') => new Response(why);

/** Later of the two, treating nulls as "not set". A grace period can run
 *  past the nominal expiry, and it is the one that decides access. */
function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

Deno.serve(async (req) => {
  // Fail closed. An unset secret must not mean "open to everyone".
  if (!SECRET || req.headers.get('authorization') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const ev = body?.event;
  if (!ev?.type) return ok('skip: no event');

  const type: string = ev.type;
  const store: string | null = (ev.store ?? null)?.toLowerCase?.() ?? null;
  const environment: string =
    (ev.environment ?? 'PRODUCTION').toLowerCase() === 'sandbox'
      ? 'sandbox'
      : 'production';

  // TEST events come from the dashboard's "Send test webhook" button and
  // carry no real subscriber. Answering 200 is how the dashboard reports
  // the endpoint as reachable.
  //
  // Recorded before returning, deliberately: a 200 in someone else's
  // dashboard is a weak thing to debug against, and "did the test
  // webhook reach us, authenticate, and parse" is a question worth being
  // able to answer from our own database.
  if (type === 'TEST') {
    await recordEvent(ev.id ?? null, null, type, store, body).catch(() => {});
    return ok('test');
  }

  const userId = isUserId(ev.app_user_id)
    ? ev.app_user_id
    : isUserId(ev.original_app_user_id)
      ? ev.original_app_user_id
      : null;

  // Dedupe first: a retry of an event we already applied must not be
  // re-applied on top of a newer one.
  const fresh = await recordEvent(
    ev.id ?? null,
    userId,
    type,
    store,
    body,
  );
  if (!fresh) return ok('duplicate');

  // TRANSFER carries no single app_user_id — it names both sides.
  if (type === 'TRANSFER') {
    const from: string[] = (ev.transferred_from ?? []).filter(isUserId);
    const to: string[] = (ev.transferred_to ?? []).filter(isUserId);
    for (const id of from) {
      await applyEntitlement({
        userId: id,
        store,
        productId: ev.product_id ?? null,
        rcAppUserId: id,
        status: 'expired',
        entitledUntil: new Date().toISOString(),
        willRenew: false,
        environment,
      });
    }
    for (const id of to) {
      await applyEntitlement({
        userId: id,
        store,
        productId: ev.product_id ?? null,
        rcAppUserId: id,
        status: 'active',
        entitledUntil: msToIso(ev.expiration_at_ms),
        willRenew: true,
        environment,
      });
    }
    return ok(`transfer ${from.length}->${to.length}`);
  }

  if (!userId) {
    // An anonymous RevenueCat id — the purchase happened before the app
    // called logIn(). Not an error: the sync call re-links it as soon as
    // the app knows who is signed in.
    return ok('skip: anonymous app_user_id');
  }

  // Events for some other entitlement are not ours to act on. When the
  // field is absent (non-subscription purchases) we do not assume.
  const ids: string[] | undefined = ev.entitlement_ids ?? undefined;
  if (Array.isArray(ids) && !ids.includes(ENTITLEMENT)) {
    return ok(`skip: entitlement ${ids.join(',')}`);
  }

  const expiry = msToIso(ev.expiration_at_ms);
  const grace = msToIso(ev.grace_period_expiration_at_ms);

  let status: string;
  let entitledUntil: string | null;
  let willRenew: boolean;

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'SUBSCRIPTION_EXTENDED':
    case 'NON_RENEWING_PURCHASE':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      status = 'active';
      entitledUntil = laterOf(expiry, grace);
      willRenew = true;
      break;

    case 'CANCELLATION':
      // Access deliberately unchanged — see the header.
      status = 'cancelled';
      entitledUntil = laterOf(expiry, grace);
      willRenew = false;
      break;

    case 'BILLING_ISSUE':
      status = 'billing_issue';
      entitledUntil = laterOf(expiry, grace);
      willRenew = true; // the store is still retrying
      break;

    case 'SUBSCRIPTION_PAUSED':
      status = 'paused';
      entitledUntil = laterOf(expiry, grace);
      willRenew = false;
      break;

    case 'EXPIRATION':
      status = 'expired';
      // Trust the store's timestamp, but never let a stray future value
      // in an expiry event extend access.
      entitledUntil = expiry && Date.parse(expiry) < Date.now()
        ? expiry
        : new Date().toISOString();
      willRenew = false;
      break;

    default:
      return ok(`skip: ${type}`);
  }

  await applyEntitlement({
    userId,
    store,
    productId: ev.product_id ?? null,
    rcAppUserId: ev.app_user_id ?? null,
    status,
    entitledUntil,
    willRenew,
    environment,
  });

  return ok(`${type} -> ${status}`);
});
