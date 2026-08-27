import { create } from 'zustand';

import { useAuthStore } from './auth.store';

/** Why the wall went up. Drives the headline, so the prompt answers the
 *  question the person was actually asking rather than a generic "sign
 *  in to continue" — someone who tapped Join is being told what joining
 *  gets them, not scolded for not having an account. */
export type AuthWallReason =
  | 'join'
  | 'save'
  | 'chat'
  | 'create'
  | 'events'
  | 'profile'
  | 'generic';

type AuthWallState = {
  open: boolean;
  reason: AuthWallReason;

  /** Call before anything that needs an identity. Returns true when the
   *  viewer is signed in; otherwise raises the wall and returns false.
   *
   *  Deliberately the same shape as `useModerationStore.guard()` — the
   *  two are the app's only "may I?" checks and reading alike makes it
   *  obvious at a call site that both have to pass. */
  guard: (reason?: AuthWallReason) => boolean;
  show: (reason?: AuthWallReason) => void;
  hide: () => void;
};

export const useAuthWallStore = create<AuthWallState>((set) => ({
  open: false,
  reason: 'generic',

  guard: (reason = 'generic') => {
    if (useAuthStore.getState().session) return true;
    set({ open: true, reason });
    return false;
  },

  show: (reason = 'generic') => set({ open: true, reason }),
  hide: () => set({ open: false }),
}));
