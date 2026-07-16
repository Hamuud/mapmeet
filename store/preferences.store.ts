import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Appearance = 'light' | 'dark' | 'auto';

type PreferencesState = {
  pushNotifications: boolean;
  appearance: Appearance;
  language: string;
  searchRadiusKm: number;
  /** Emoji used by the hover quick-react chip in chat. Must be one of
   *  the toggle_reaction RPC whitelist. */
  favoriteReaction: string;

  setPushNotifications: (v: boolean) => void;
  setAppearance: (v: Appearance) => void;
  setLanguage: (v: string) => void;
  setSearchRadiusKm: (v: number) => void;
  setFavoriteReaction: (v: string) => void;
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

      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setAppearance: (appearance) => set({ appearance }),
      setLanguage: (language) => set({ language }),
      setSearchRadiusKm: (searchRadiusKm) => set({ searchRadiusKm }),
      setFavoriteReaction: (favoriteReaction) => set({ favoriteReaction }),
    }),
    {
      name: 'mapmeet-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
