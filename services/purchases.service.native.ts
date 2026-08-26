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

/** The monthly subscription package, or null if the store has nothing to
 *  offer — no products configured, no App Store agreement signed, or the
 *  device is offline.
 *
 *  Three fallbacks, because there are three separate ways a dashboard
 *  that LOOKS configured still returns nothing here, and they are
 *  indistinguishable from the app:
 *
 *  - `offerings.current` is whichever offering is flagged Current. An
 *    offering can exist, be complete, and still not be flagged — so fall
 *    back to `default` by name, then to whatever exists.
 *  - `.monthly` is a shortcut for the package whose identifier is the
 *    reserved `$rc_monthly`. A package built as "Custom" and merely
 *    *named* monthly is not that, and the shortcut returns null.
 *  - Failing both, take the first package rather than nothing: an
 *    offering with exactly one package in it is unambiguous, and
 *    refusing to sell it helps nobody.
 *
 *  In development it says which branch it took, because "Premium isn't
 *  available right now" is the least actionable error in this file. */
export async function monthlyPackage(): Promise<PurchasesPackage | null> {
  if (!isPurchasesAvailable()) return null;
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
      return null;
    }

    const pkg =
      offering.monthly ??
      offering.availablePackages.find((p) => /month/i.test(p.identifier)) ??
      offering.availablePackages[0] ??
      null;

    if (__DEV__) {
      if (!pkg) {
        console.warn(
          `[purchases] offering "${offering.identifier}" has no packages.`,
        );
      } else if (!offering.monthly) {
        console.warn(
          `[purchases] no $rc_monthly package in "${offering.identifier}"; ` +
            `falling back to "${pkg.identifier}". Set the package type to ` +
            `Monthly in RevenueCat to make this deliberate.`,
        );
      }
    }

    return pkg;
  } catch (e) {
    if (__DEV__) console.warn('[purchases] getOfferings failed', e);
    return null;
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
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
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
