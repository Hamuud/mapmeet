import { create } from 'zustand';

import { supabase } from '@/services/supabase';
import {
  initPurchases,
  logOutPurchases,
  monthlyPackage,
  purchase,
  restore,
  syncSubscription,
  type PurchaseOutcome,
} from '@/services/purchases.service';
import { useModerationStore } from './moderation.store';

export type SubscriptionState = {
  /** Is the account paying right now. The server's answer, never the
   *  store SDK's — the SDK is only asked to start purchases. */
  active: boolean;
  status: string | null;
  entitledUntil: string | null;
  willRenew: boolean;
  loaded: boolean;
  /** Localised price string from the store ("£2.99"), or null when there
   *  is nothing to sell on this platform. */
  price: string | null;
  busy: boolean;

  bootstrap: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
  buy: () => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

/** Read the entitlement back from our own database.
 *
 *  Deliberately not from the RevenueCat SDK's cached CustomerInfo: that
 *  would let the app disagree with the server about who is premium, and
 *  the server is the one enforcing it. */
async function readQuota(): Promise<{
  active: boolean;
  status: string | null;
  entitledUntil: string | null;
  willRenew: boolean;
}> {
  const { data, error } = await supabase.rpc('my_subscription');
  const row = (data as
    | {
        active: boolean;
        status: string;
        entitled_until: string | null;
        will_renew: boolean;
      }[]
    | null)?.[0];
  if (error || !row) {
    return { active: false, status: null, entitledUntil: null, willRenew: false };
  }
  return {
    active: row.active,
    status: row.status,
    entitledUntil: row.entitled_until,
    willRenew: row.will_renew,
  };
}

/** profiles.role is a cache of the entitlement, and the moderation store
 *  is a cache of that. Both go stale the instant a purchase completes,
 *  which is exactly when the user is looking for the thing they just
 *  paid for — so anything that changes entitlement refreshes it. */
async function refreshRole(): Promise<void> {
  await useModerationStore.getState().refresh();
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  active: false,
  status: null,
  entitledUntil: null,
  willRenew: false,
  loaded: false,
  price: null,
  busy: false,

  /** Called once per signed-in session.
   *
   *  The sync is what repairs a lost webhook: it makes the server go and
   *  ask RevenueCat rather than trusting whatever is in our table. Doing
   *  it on every launch means the worst case for a paying customer whose
   *  RENEWAL webhook went missing is "premium is missing until they next
   *  open the app", not "until they complain". */
  bootstrap: async (userId) => {
    try {
      await initPurchases(userId);
    } catch {
      // No store on this build, or no key configured. Entitlement still
      // reads fine below; only buying is unavailable.
    }
    await syncSubscription().catch(() => false);
    await get().refresh();

    void monthlyPackage()
      .then((pkg) => set({ price: pkg?.product.priceString ?? null }))
      .catch(() => set({ price: null }));
  },

  refresh: async () => {
    const q = await readQuota();
    set({ ...q, loaded: true });
  },

  buy: async () => {
    if (get().busy) return { kind: 'cancelled' as const };
    set({ busy: true });
    try {
      const pkg = await monthlyPackage();
      if (!pkg) {
        return { kind: 'failed' as const, message: 'no offering' };
      }
      const outcome = await purchase(pkg);
      if (outcome.kind === 'purchased') {
        await get().refresh();
        await refreshRole();
      }
      return outcome;
    } finally {
      set({ busy: false });
    }
  },

  restorePurchases: async () => {
    if (get().busy) return false;
    set({ busy: true });
    try {
      await restore();
      await get().refresh();
      await refreshRole();
      return get().active;
    } finally {
      set({ busy: false });
    }
  },

  /** Unbind the SDK and drop the cached entitlement, so the next account
   *  on this device does not briefly inherit the last one's premium. */
  signOut: async () => {
    await logOutPurchases().catch(() => {});
    set({
      active: false,
      status: null,
      entitledUntil: null,
      willRenew: false,
      loaded: false,
      price: null,
    });
  },
}));
