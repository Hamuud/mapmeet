import { useAuthStore } from '@/store/auth.store';

/** Thin selector so screens don't couple to Zustand internals.
 *
 *  Each field is read via its own selector — the composed object is
 *  assembled *outside* the store subscription. If we returned
 *  `{ session, profile, ... }` from a single selector, the fresh object
 *  reference on every render would fail Zustand's `Object.is` snapshot
 *  check inside `useSyncExternalStore`, triggering React error #185
 *  ("Maximum update depth exceeded").
 */
export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const status = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);
  return {
    session,
    profile,
    status,
    isAuthenticated: !!session,
    signOut,
  };
}
