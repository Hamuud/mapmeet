import { create } from 'zustand';

import { reportsService, type UserRole } from '@/services/reports.service';

type ModerationState = {
  mutedUntil: string | null;
  banned: boolean;
  warnings: number;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
  loaded: boolean;
  /** Open when a restricted user tried to do something. */
  blockedOpen: boolean;

  refresh: () => Promise<void>;
  /** True while the account can't post. Re-evaluated against the clock so
   *  a lapsed mute stops blocking without needing a refetch. */
  isRestricted: () => boolean;
  /** Call before a write. Returns false and raises the dialog when the
   *  account is muted or banned. */
  guard: () => boolean;
  showBlocked: () => void;
  hideBlocked: () => void;
};

export const useModerationStore = create<ModerationState>((set, get) => ({
  mutedUntil: null,
  banned: false,
  warnings: 0,
  role: 'user',
  isAdmin: false,
  isOwner: false,
  loaded: false,
  blockedOpen: false,

  refresh: async () => {
    try {
      const s = await reportsService.myState();
      set({
        mutedUntil: s.mutedUntil,
        banned: s.banned,
        warnings: s.warnings,
        role: s.role,
        isAdmin: s.isAdmin,
        isOwner: s.isOwner,
        loaded: true,
      });
    } catch {
      // Migration not applied yet / offline — never block on a failure to
      // read moderation state.
      set({ loaded: true });
    }
  },

  isRestricted: () => {
    const { banned, mutedUntil } = get();
    if (banned) return true;
    return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
  },

  guard: () => {
    if (!get().isRestricted()) return true;
    set({ blockedOpen: true });
    // Re-read in the background: the mute may have just lapsed, or an
    // admin may have lifted it.
    void get().refresh();
    return false;
  },

  showBlocked: () => set({ blockedOpen: true }),
  hideBlocked: () => set({ blockedOpen: false }),
}));
