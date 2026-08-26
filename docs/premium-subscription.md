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

### 1a. Money, first — it gates everything else

**Business → Agreements, Tax, and Banking.** Sign the Paid Applications
agreement and complete banking and tax. The status has to read
**Active**; tax review can take a day or two, so start here.

Until it is active, `getOfferings()` returns nothing, the paywall says
"Premium isn't available right now", and no amount of correct code
changes that. It is the single most common reason a subscription appears
not to work.

### 1b. The products

**Your app → Monetization → Subscriptions.**

1. **Create one subscription group** — e.g. `MapMeet Premium`. Both plans
   go in the **same group**. That is what lets someone move between
   monthly and yearly instead of accidentally holding both, and Apple
   handles the proration.
2. **Create two auto-renewable subscriptions** in it:

   | Product ID | Duration |
   | --- | --- |
   | `com.mapmeet.app.premium.monthly` | 1 month |
   | `com.mapmeet.app.premium.yearly` | 1 year |

   The ids appear nowhere in this repo — only in RevenueCat — so they can
   be whatever you like, as long as the two sides agree.

   Each one needs a reference name, a price, **localisations** (display
   name + description, per language), and **review information** with a
   screenshot of the paywall.
3. **Localise the group itself** too — the group has its own display
   name per language, separate from the subscriptions inside it. Missing
   it blocks submission and the error message does not say so clearly.

### 1c. Let RevenueCat talk to Apple

4. **Users and Access → Integrations → In-App Purchase → generate a
   key.** Download the `.p8` — you get exactly one chance — and note the
   Key ID and Issuer ID.

   `react-native-purchases` v10 uses StoreKit 2, so this key is
   **required**; the older App-Specific Shared Secret on its own is not
   enough.
5. Upload the `.p8` in RevenueCat under your App Store app →
   **In-app purchase key configuration**.
6. **App Store Server Notifications V2** — point Apple at RevenueCat's
   URL (RevenueCat shows it, and can configure it for you once the key
   above is uploaded). This is what makes renewals, cancellations and
   refunds reach RevenueCat — and therefore us — promptly rather than
   at the next app launch.

### 1d. Submission

7. Attach both subscriptions to the app version and submit them
   **together with a build**. The first subscription in an app is
   reviewed alongside a version; later ones can go on their own. So this
   ships with the version after whatever is currently in review.

## 2. RevenueCat

1. Create a project, add the iOS app with bundle id `com.mapmeet.app`.
2. Upload the **App Store Connect API key** (In-App Purchase key) so
   RevenueCat can read subscription status server-side, and paste the
   **App-Specific Shared Secret** from App Store Connect.
3. **Entitlement**: whatever identifier the dashboard gives it — ours is
   `com_mapmeet_app_pro`. It is NOT our name for the tier; internally
   that is `premium` everywhere, and this is only RevenueCat's key for
   it.

   It must match in exactly three places, and a mismatch is the nastiest
   failure in this system — the payment succeeds, the webhook answers
   200, and nothing unlocks:

   | Where | Value |
   | --- | --- |
   | RevenueCat dashboard | `com_mapmeet_app_pro` |
   | `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT` in `.env` + EAS | same |
   | `REVENUECAT_ENTITLEMENT` Supabase secret | same |

   Both default to `premium` when unset, which is wrong for this
   project — so neither may be left blank.
4. **Offering**: `default`, flagged **Current**, with a **Monthly** and
   an **Annual** package. Set the package *type* rather than just naming
   them — that is what gives them the reserved `$rc_monthly` /
   `$rc_annual` identifiers the SDK reads. (`availablePlans()` falls back
   to matching on the name, but that is a rescue, not the design.)
5. **Webhook**: Integrations → Webhooks
   - URL: `https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header value: a long random string — the *same* one
     you set as `REVENUECAT_WEBHOOK_SECRET` below. A `Bearer ` prefix on
     one side only is fine; the function strips it.
   - Environment: **Both Production and Sandbox**, or nothing you test
     will arrive.
   - Event type: **All events**. Filtering to purchases would grant
     correctly and then never revoke.

### Moving off the Test Store

The Test Store products are separate objects from the App Store ones.
When the App Store side is live:

6. **Products** — add the two App Store products by their exact product
   ids from step 1b.
7. **Offering** — point the Monthly and Annual packages at the App Store
   products.
8. **Entitlement** — attach both App Store products to
   `com_mapmeet_app_pro`.

   ⚠ Step 8 is the one people skip. A product that is in the offering but
   not on the entitlement sells perfectly: the payment goes through, the
   webhook answers 200, `entitlement_ids` comes back empty, and nothing
   unlocks. If a real purchase ever appears to do nothing, check this
   first:

   ```bash
   supabase db query --linked "select type, payload->'event'->>'entitlement_ids' as ents, payload->'event'->>'product_id' as product from public.subscription_events order by id desc limit 5;"
   ```

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
