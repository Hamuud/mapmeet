// MapMeet — purchases, web build.
//
// There is no App Store on hamuud.github.io, and this stub is what keeps
// `react-native-purchases` out of the web bundle entirely: the native
// file is the only thing that imports it, and Metro never reaches for
// that file on web.
//
// Entitlement itself is server-side, so this is only about SELLING.
// Somebody who subscribed on their iPhone gets premium on the website
// immediately — `can_style_pin()` reads the same row either way. All
// that is missing here is a way to start a purchase, and
// `isPurchasesAvailable()` returning false is how the paywall knows to
// say "subscribe in the app" instead of showing a dead button.
//
// Adding web billing later means implementing this file against
// RevenueCat Web Billing (or Stripe) — no backend change, because the
// webhook already records whichever `store` the money came from.

import { supabase } from './supabase';

export const ENTITLEMENT =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'premium';

/** Nothing to sell here. */
export function isPurchasesAvailable(): boolean {
  return false;
}

export async function initPurchases(_userId: string): Promise<void> {}

export async function logOutPurchases(): Promise<void> {}

export type Plan = {
  id: string;
  period: 'monthly' | 'annual';
  priceString: string;
  price: number;
};

/** Nothing on sale, so nothing to choose between. The paywall shows its
 *  "subscribe in the app" state rather than an empty plan picker. */
export async function availablePlans(): Promise<Plan[]> {
  return [];
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export async function purchasePlan(_planId: string): Promise<PurchaseOutcome> {
  return { kind: 'failed', message: 'unavailable on web' };
}

export async function restore(): Promise<boolean> {
  return false;
}

/** Still worth calling on web: it re-reads whatever the stores have
 *  already told RevenueCat, so a subscription bought on the phone shows
 *  up here without waiting for the hourly sweep. */
export async function syncSubscription(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('subscription-sync');
    if (error) return false;
    return !!(data as { active?: boolean } | null)?.active;
  } catch {
    return false;
  }
}
