import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** The RevenueCat entitlement identifier.
 *
 *  NOT the same thing as our own name for the tier. Internally the tier
 *  is `premium` everywhere — the role, the table, the UI — and this is
 *  only the key RevenueCat files it under, which is whatever the
 *  dashboard generated. Ours is `com_mapmeet_app_pro`.
 *
 *  Configurable because it has to match `REVENUECAT_ENTITLEMENT` in the
 *  Edge Functions and the dashboard exactly, and a mismatch is the
 *  nastiest failure in this whole system: the payment succeeds, the
 *  webhook answers 200, and nothing unlocks. One env var, read by both
 *  sides, is how that stops being possible to get half-right. */
export const ENTITLEMENT =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'premium';

/** Public SDK keys. These are *meant* to ship inside the app — they can
 *  only read and start purchases, never grant an entitlement. The secret
 *  key (sk_…) lives in the Edge Function and must never appear here.
 *
 *  Read from EXPO_PUBLIC_* like every other key in this codebase. Unlike
 *  Supabase's, a missing one is not fatal: the app runs fine with
 *  nothing for sale, which is what every build before the store products
 *  exist will be. */
/** A Test Store key (`test_…`) in a RELEASE build is fatal, by design:
 *  the RevenueCat SDK detects it, shows an alert and deliberately
 *  crashes the app on launch so test purchases can never be mistaken for
 *  real ones. That is a reasonable thing for them to do and a terrible
 *  thing to discover from TestFlight.
 *
 *  So a test key is honoured in development and ignored everywhere else.
 *  The worst case becomes "premium is not for sale in this build",
 *  which is recoverable, instead of "the app dies on launch", which is
 *  a point release. */
function usableKey(raw: string | undefined): string {
  const key = raw ?? '';
  if (key.startsWith('test_') && !__DEV__) return '';
  return key;
}

const KEYS = {
  ios: usableKey(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  android: usableKey(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
};

let configured = false;

/** True once the SDK has a key. Everything else no-ops without it, so a
 *  build with no key configured degrades to "premium is not for sale"
 *  rather than crashing on launch. */
export function isPurchasesAvailable(): boolean {
  return !!(Platform.OS === 'ios' ? KEYS.ios : KEYS.android);
}

/** Start the SDK and bind it to the signed-in account.
 *
 *  `logIn(userId)` is the load-bearing line: it makes RevenueCat's
 *  app_user_id equal the Supabase user id, which is the ONLY thing
 *  connecting a webhook payload to an account. Without it every purchase
 *  arrives under an anonymous `$RCAnonymousID:…` and the webhook has
 *  nowhere to write. */
export async function initPurchases(userId: string): Promise<void> {
  if (!isPurchasesAvailable()) return;
  const apiKey = Platform.OS === 'ios' ? KEYS.ios : KEYS.android;

  if (!configured) {
    // VERBOSE in development, because the first thing anyone debugs here
    // is why a purchase did not unlock anything. Quiet in release: at
    // VERBOSE the SDK logs receipt payloads and user ids.
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  } else {
    await Purchases.logIn(userId);
  }
}

/** Unbind on sign-out, so the next account on this device does not
 *  inherit the last one's entitlement in the SDK's local cache. */
export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Already anonymous. Nothing to undo.
  }
}

/** One buyable plan, flattened for the UI.
 *
 *  The `PurchasesPackage` itself deliberately does not leave this file —
 *  it is a native SDK object, and threading it through a Zustand store
 *  and a web stub that has no SDK would mean typing around something
 *  neither of them can hold. The UI passes `id` back to `purchasePlan`
 *  and this module does the lookup. */
export type Plan = {
  id: string;
  period: 'monthly' | 'annual';
  /** Localised and currency-formatted by the store. Never build this
   *  yourself: the store knows the user's storefront, currency and
   *  local conventions, and we do not. */
  priceString: string;
  /** Numeric, same currency across an offering — only used to work out
   *  what the annual plan saves. */
  price: number;
};

/** id → package, so the UI can stay free of SDK types. Repopulated on
 *  every `availablePlans()`; a stale id simply fails to buy. */
const packagesById = new Map<string, PurchasesPackage>();

function periodOf(pkg: PurchasesPackage): 'monthly' | 'annual' | null {
  const type = String(pkg.packageType).toUpperCase();
  if (type === 'MONTHLY') return 'monthly';
  if (type === 'ANNUAL') return 'annual';
  // A package built as "Custom" carries no type worth reading, so fall
  // back to what it was named.
  if (/month/i.test(pkg.identifier)) return 'monthly';
  if (/year|annual/i.test(pkg.identifier)) return 'annual';
  return null;
}

/** Everything on sale, monthly first. Empty when the store has nothing
 *  to offer — no packages configured, no App Store agreement signed, or
 *  the device is offline.
 *
 *  Two fallbacks, because a dashboard that LOOKS configured can still
 *  return nothing and the app cannot tell the cases apart:
 *
 *  - `offerings.current` is whichever offering is flagged Current, and
 *    an offering can be complete without ever being flagged — so fall
 *    back to `default` by name, then to whatever exists.
 *  - `packageType` is only meaningful when the package was built as
 *    Monthly or Annual rather than Custom, hence `periodOf`.
 *
 *  In development it says what it found, because "Premium isn't
 *  available right now" is the least actionable error in this file. */
export async function availablePlans(): Promise<Plan[]> {
  if (!isPurchasesAvailable()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const offering =
      offerings.current ??
      offerings.all['default'] ??
      Object.values(offerings.all)[0] ??
      null;

    if (!offering) {
      if (__DEV__) {
        console.warn(
          '[purchases] no offering. Create one in RevenueCat and mark it Current.',
        );
      }
      return [];
    }

    packagesById.clear();
    const plans: Plan[] = [];
    for (const pkg of offering.availablePackages) {
      const period = periodOf(pkg);
      if (!period) continue;
      packagesById.set(pkg.identifier, pkg);
      plans.push({
        id: pkg.identifier,
        period,
        priceString: pkg.product.priceString,
        price: pkg.product.price,
      });
    }

    // Monthly first: it is the default choice and the one the copy and
    // the App Store listing describe.
    plans.sort((a, b) => (a.period === b.period ? 0 : a.period === 'monthly' ? -1 : 1));

    if (__DEV__) {
      if (plans.length === 0) {
        console.warn(
          `[purchases] offering "${offering.identifier}" has ${offering.availablePackages.length} ` +
            `package(s), none recognisable as monthly or annual. Set the package ` +
            `type in RevenueCat.`,
        );
      } else {
        console.log(
          `[purchases] plans: ${plans.map((p) => `${p.period}=${p.priceString}`).join(', ')}`,
        );
      }
    }

    return plans;
  } catch (e) {
    if (__DEV__) console.warn('[purchases] getOfferings failed', e);
    return [];
  }
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

function entitled(info: CustomerInfo): boolean {
  return !!info.entitlements.active[ENTITLEMENT];
}

/** Buy it. The store's own sheet handles payment and Apple's own UI
 *  handles confirmation; all we get back is whether the entitlement is
 *  now active.
 *
 *  A successful purchase is followed by a server sync rather than being
 *  trusted on its own — see `syncSubscription`. */
export async function purchasePlan(planId: string): Promise<PurchaseOutcome> {
  const pkg = packagesById.get(planId);
  if (!pkg) return { kind: 'failed', message: 'no offering' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (!entitled(customerInfo)) {
      return { kind: 'failed', message: 'entitlement not active' };
    }
    await syncSubscription();
    return { kind: 'purchased' };
  } catch (e: unknown) {
    // RevenueCat marks a user-cancelled flow with this flag rather than
    // an error code; showing "purchase failed" for it would be a lie.
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { kind: 'cancelled' };
    }
    return {
      kind: 'failed',
      message: e instanceof Error ? e.message : 'purchase failed',
    };
  }
}

/** Restore Purchases. Required by App Store review for any app selling a
 *  non-consumable or subscription — an account that already pays must be
 *  able to get access back on a new device without paying twice. */
export async function restore(): Promise<boolean> {
  if (!isPurchasesAvailable()) return false;
  try {
    const info = await Purchases.restorePurchases();
    await syncSubscription();
    return entitled(info);
  } catch {
    return false;
  }
}

/** Ask our own server to re-read the truth from RevenueCat.
 *
 *  The client never asserts its own entitlement: it asks the server to
 *  go and check. That is why this posts no body — the caller's JWT is
 *  the entire input, and a client that could claim entitlement could
 *  grant itself premium.
 *
 *  Called after a purchase, after a restore, and on launch, which is
 *  what repairs a lost webhook. */
export async function syncSubscription(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('subscription-sync');
    if (error) return false;
    return !!(data as { active?: boolean } | null)?.active;
  } catch {
    return false;
  }
}
