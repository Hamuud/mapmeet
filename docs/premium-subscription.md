# Premium subscription — setup runbook

Monthly auto-renewing subscription, sold through the App Store, granting
the `premium` entitlement. Google Play and web billing can be added later
without touching the backend.

## What is already done

Applied to `wpcwjjlaoolnqddeqpce`, deployed, and in the repo:

- `20260827000000_subscriptions.sql` — `subscriptions`,
  `subscription_events`, `has_active_subscription()`, `sync_premium_role()`,
  `expire_lapsed_subscriptions()`, `my_subscription()`, and `can_style_pin()`
  widened to read the entitlement as well as the role.
- `20260827000001_subscriptions_cron.sql` — hourly sweep at `:17`.
- Edge Functions `revenuecat-webhook` and `subscription-sync`, both live
  and both currently refusing every request because no secret is set.
- Client: `react-native-purchases`, `services/purchases.service.native.ts`
  (+ `.web.ts` stub), `store/subscription.store.ts`, `app/premium.tsx`,
  and a Settings → **MapMeet Premium** row.

**Nothing is for sale yet.** Every step below is one only you can do.

## The design, in one paragraph

RevenueCat validates receipts and runs the renewal → billing-retry →
grace → expiry state machine. It pushes each transition to
`revenuecat-webhook`, which writes a row in `subscriptions` whose
`entitled_until` is the instant access should end. Access is that
timestamp — never a status flag — so a webhook that never arrives lapses
the subscriber instead of granting forever, and `subscription-sync`
(called on every launch, on Restore, and after a purchase) repairs the
opposite case by making the *server* ask RevenueCat for the truth.

`profiles.role` is only a cache of this. It is synced between `user` and
`premium` and **never** touches a staff role — see the header of the
migration for why that matters.

---

## 0. Test Store — try the whole thing before any App Store setup

RevenueCat provisions a **Test Store** with every project, keyed
`test_…`. With that key the SDK ignores StoreKit entirely, serves
products configured in the RevenueCat dashboard, and replaces Apple's
payment sheet with a modal offering "succeed / fail / cancel". No Paid
Applications Agreement, no product, no sandbox tester, no device.

That means the *interesting* half of this system — paywall → purchase →
entitlement → `premium` role → Style step appears — is testable now, on
a dev build, and only the App Store plumbing has to wait.

`.env` already holds a test key for iOS and Android.

⚠ **A `test_` key crashes a release build on purpose.** RevenueCat
detects it at launch, alerts, and kills the app so test purchases can
never leak into production. `purchases.service.native.ts` therefore
ignores any `test_` key unless `__DEV__`, turning that crash into
"premium isn't for sale in this build" — but the real `appl_…` key still
has to reach the EAS secret before a TestFlight build, or premium will
be quietly unbuyable there.

```bash
npx eas build --platform ios --profile development
```

## 1. App Store Connect

1. **Sign the Paid Applications Agreement** — Business → Agreements, plus
   banking and tax details. Until this is active, in-app purchase
   products do not load at all and the paywall will show "Premium isn't
   available right now". This is the single most common reason a
   subscription appears not to work.
2. **Create a subscription group**, e.g. `MapMeet Premium`. Groups are
   how upgrades/downgrades work later; one group, one level for now.
3. **Create the auto-renewable subscription** in that group:
   - Product ID: `com.mapmeet.app.premium.monthly` (suggested — it is
     referenced nowhere in the code, only in RevenueCat)
   - Duration: 1 month
   - Price: your call
   - Localisations, a display name, and a **review screenshot** of the
     paywall — all required before it can be submitted.
4. Attach the subscription to the next app version. **A subscription is
   reviewed with a build**, so this ships with 1.0.2 (or whatever
   follows the version currently in review), not on its own.

## 2. RevenueCat

1. Create a project, add the iOS app with bundle id `com.mapmeet.app`.
2. Upload the **App Store Connect API key** (In-App Purchase key) so
   RevenueCat can read subscription status server-side, and paste the
   **App-Specific Shared Secret** from App Store Connect.
3. **Entitlement**: create one with the identifier exactly `premium`.
   This string appears in three places and all three must match:
   the dashboard, `ENTITLEMENT` in `services/purchases.service.native.ts`,
   and `REVENUECAT_ENTITLEMENT` in the Edge Functions (defaults to
   `premium`, so leaving it unset is fine).
4. **Offering**: create the default offering with a **Monthly** package
   pointing at the product from step 1.3. The paywall reads
   `offerings.current.monthly`.
5. **Webhook**: Integrations → Webhooks
   - URL: `https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header value: a long random string — the *same* one
     you set as `REVENUECAT_WEBHOOK_SECRET` below.

## 3. Secrets

```bash
supabase secrets set REVENUECAT_WEBHOOK_SECRET='<the same string as the RevenueCat webhook header>'
supabase secrets set REVENUECAT_SECRET_KEY='<sk_… from RevenueCat → API keys>'
```

`sk_…` is the **secret** key. It can grant entitlements, so it belongs
only here — never in `.env`, never in the app.

Then in `.env` (gitignored) add the **public** SDK keys, which are meant
to ship inside the app:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
```

and mirror the iOS one into EAS so release builds get it:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…
```

## 4. Build

`react-native-purchases` is native code, so the current TestFlight build
cannot sell anything. Rebuild:

```bash
npx eas build --platform ios --profile production --auto-submit
```

## 5. Testing

For the flow itself, the Test Store (section 0) is enough and needs no
App Store setup at all.

For the real thing, use a **Sandbox tester** (App Store Connect → Users
and Access → Sandbox) on a physical device. Sandbox subscriptions renew
every few minutes and expire after six renewals, which is what makes the
whole lifecycle testable in an afternoon.

Watch it work:

```sql
-- what the webhook received
select type, store, created_at from subscription_events order by id desc limit 20;

-- and what it decided
select user_id, status, entitled_until, will_renew, environment from subscriptions;
```

Things worth deliberately trying, because each exercises a different
branch:

| Do this | Expect |
| --- | --- |
| Subscribe | `status=active`, role → `premium`, Style step appears in the create wizard |
| Cancel in Settings | `will_renew=false`, `status=cancelled`, **access retained** until `entitled_until` |
| Let it lapse | `EXPIRATION` → role back to `user`, styling gone |
| Delete + reinstall, Restore | entitlement back without paying again |
| Subscribe on a staff account | role stays `designer`/`owner`, styling still works |

## 6. Review notes

Guideline 3.1.2 rejections are about the paywall's *copy*, and
`app/premium.tsx` already carries what it asks for: title, length, price,
"renews until cancelled", how to cancel, Restore, and a Terms & Privacy
link. If you change that screen, keep all seven.

Make sure `https://hamuud.github.io/mapmeet/legal/` actually serves terms
covering the subscription — reviewers follow that link.

## Known limits

- **The web build cannot sell.** It shows "Subscribe in the app". Somebody
  who subscribed on iPhone gets premium on the website immediately,
  because entitlement is server-side.
- **Android is not wired.** When you want it: add the Play app in
  RevenueCat, create the matching product, set
  `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, and build. No backend change —
  the webhook already records `store` and treats every store alike.
- **A comped `premium` role is never revoked by any of this.**
  `sync_premium_role()` ignores accounts with no `subscriptions` row, so
  hand-granting premium in the admin panel still works as it always did.
