import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { authService } from '@/services/auth.service';
import { profilesService } from '@/services/profiles.service';
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
    const session = await authService.getSession();
    await get().setSession(session);
    // Subscribe once — the returned handle is intentionally leaked for the
    // life of the process. Re-mounting would create duplicate listeners.
    authService.onAuthStateChange((next) => {
      void get().setSession(next);
    });
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
    set({ session: null, profile: null });
  },

  setProfile: (profile) => set({ profile }),
}));
