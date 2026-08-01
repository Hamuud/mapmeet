import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Appearance = 'light' | 'dark' | 'auto';

/** Voice-note playback speeds, in the order the bubble's pill cycles
 *  them (Telegram's ladder). */
export const VOICE_RATES = [1, 1.5, 2] as const;
export type VoiceRate = (typeof VOICE_RATES)[number];

type PreferencesState = {
  pushNotifications: boolean;
  appearance: Appearance;
  language: string;
  searchRadiusKm: number;
  /** Emoji used by the hover quick-react chip in chat. Must be one of
   *  the toggle_reaction RPC whitelist. */
  favoriteReaction: string;
  /** Voice-message speed. Global on purpose: pick 2× once and every
   *  voice note — event chat, group, DM — plays at 2× until you change
   *  it back, which is what Telegram does and what people expect. */
  voiceRate: VoiceRate;

  setPushNotifications: (v: boolean) => void;
  setAppearance: (v: Appearance) => void;
  setLanguage: (v: string) => void;
  setSearchRadiusKm: (v: number) => void;
  setFavoriteReaction: (v: string) => void;
  /** 1× → 1.5× → 2× → 1× */
  cycleVoiceRate: () => void;
};

/** Client-only user preferences. Persisted in AsyncStorage so the
 *  Settings screen isn't a bag of ephemeral toggles that reset on cold
 *  start. Nothing in here talks to Supabase — profile-shaped fields
 *  (name, bio, avatar…) live in the `profiles` table via
 *  `profilesService.update`. */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      pushNotifications: true,
      appearance: 'auto',
      language: 'English',
      searchRadiusKm: 5,
      favoriteReaction: '❤️',
      voiceRate: 1,

      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setAppearance: (appearance) => set({ appearance }),
      setLanguage: (language) => set({ language }),
      setSearchRadiusKm: (searchRadiusKm) => set({ searchRadiusKm }),
      setFavoriteReaction: (favoriteReaction) => set({ favoriteReaction }),
      cycleVoiceRate: () =>
        set((s) => {
          const i = VOICE_RATES.indexOf(s.voiceRate);
          // indexOf < 0 → a persisted value from a future/older build;
          // fall back to the head of the ladder rather than sticking.
          return { voiceRate: VOICE_RATES[(i + 1) % VOICE_RATES.length] ?? 1 };
        }),
    }),
    {
      name: 'mapmeet-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
