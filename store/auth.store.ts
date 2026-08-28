import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { authService } from '@/services/auth.service';
import { profilesService } from '@/services/profiles.service';
import { useSubscriptionStore } from './subscription.store';
import type { Profile } from '@/types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  status: 'idle' | 'loading' | 'ready';
  bootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => Promise<void>;
  setProfile: (profile: Profile) => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  status: 'idle',

  bootstrap: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });

    // Subscribe BEFORE reading the stored session, not after.
    //
    // Two reasons, and both used to bite. The listener is the only thing
    // that delivers TOKEN_REFRESHED and SIGNED_OUT for the rest of the
    // process, so wiring it behind an `await` meant a failed read left
    // the app with no listener at all. And the read below can throw
    // (see the catch), which skipped this line entirely.
    //
    // Subscribing once is deliberate — the handle is leaked for the life
    // of the process, because re-mounting would stack up duplicates.
    authService.onAuthStateChange((next) => {
      // Deferred out of the callback on purpose. supabase-js runs this
      // while holding its auth lock, and any other supabase call made
      // inside it queues behind that same lock — `setSession` fetches
      // the profile, so calling it here deadlocks the client: the fetch
      // waits for the lock, the lock waits for the callback to return.
      // A tick later the lock is free and the same work is safe.
      setTimeout(() => void get().setSession(next), 0);
    });

    try {
      const session = await authService.getSession();
      await get().setSession(session);
    } catch {
      // Reading the stored session failed — an access token whose
      // refresh couldn't complete, no network at launch, or Supabase
      // having a bad minute. Fall through as signed-out rather than
      // leaving `status` on 'loading': every screen renders a
      // full-screen spinner in that state, nothing else can clear it,
      // and the one-shot guard at the top means it never retries. The
      // app was frozen until the user killed and reopened it.
      //
      // A guest gets the map, which is browsable anyway, and a real
      // session comes back through the listener above the moment the
      // refresh succeeds.
      set({ session: null, profile: null });
    }

    set({ status: 'ready' });
  },

  setSession: async (session) => {
    if (!session) {
      set({ session: null, profile: null });
      return;
    }
    // Set the session FIRST, synchronously, so the route guards react
    // immediately and send the user to /map. Previously we awaited the
    // profile fetch before storing the session, so a slow or failing
    // `getById` (a transient network blip, RLS, or the profile row not
    // being ready the instant after sign-up) threw out of `setSession`
    // and stranded the user on a blank /login — a refresh then re-read
    // the session from storage and worked. The profile now fills in
    // afterwards and can never block or break navigation.
    const changedUser = get().session?.user.id !== session.user.id;
    set(changedUser ? { session, profile: null } : { session });
    try {
      const profile = await profilesService.getById(session.user.id);
      // Guard against a stale response if the session changed meanwhile.
      if (get().session?.user.id === session.user.id) set({ profile });
    } catch {
      // Non-fatal: keep the session; the profile can load later.
    }
  },

  signOut: async () => {
    await authService.signOut();
    // Unbind the store SDK too. Without this the next account to sign in
    // on this device inherits the last one's cached entitlement until
    // the first sync lands — briefly showing somebody else's premium.
    await useSubscriptionStore.getState().signOut().catch(() => {});
    set({ session: null, profile: null });
  },

  setProfile: (profile) => set({ profile }),
}));
