import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { LOCALES, type Locale } from '@/i18n/types';

export type Appearance = 'light' | 'dark' | 'auto';

/** Best guess at the user's language on very first launch, before they
 *  have ever opened Settings. Web exposes navigator.languages; Hermes
 *  exposes the resolved ICU locale. Anything unexpected → English. */
function deviceLocale(): Locale {
  try {
    const tags: string[] =
      typeof navigator !== 'undefined' && navigator.languages?.length
        ? [...navigator.languages]
        : [Intl.DateTimeFormat().resolvedOptions().locale];
    for (const tag of tags) {
      const base = tag.toLowerCase().split('-')[0] as Locale;
      if (LOCALES.includes(base)) return base;
    }
  } catch {
    // Intl missing or locked down — English is the safe default.
  }
  return 'en';
}

/** Voice-note playback speeds, in the order the bubble's pill cycles
 *  them (Telegram's ladder). */
export const VOICE_RATES = [1, 1.5, 2] as const;
export type VoiceRate = (typeof VOICE_RATES)[number];

/** The categories a push can belong to. Each maps to a `push_*` column
 *  on profiles — the server is what actually enforces them, since a
 *  notification is decided while the app is closed. */
export type PushCategory = 'chat' | 'joins' | 'events' | 'social' | 'digest';

export const PUSH_CATEGORIES: PushCategory[] = [
  'chat',
  'joins',
  'events',
  'social',
  'digest',
];

type PreferencesState = {
  pushNotifications: boolean;
  /** Per-category switches, mirrored to the server on change. */
  push: Record<PushCategory, boolean>;
  /** Mirror joined events into the device calendar. Off by default:
   *  writing to someone's calendar unasked is not a default anyone
   *  should have chosen for them. */
  calendarSync: boolean;
  appearance: Appearance;
  /** UI language. Defaults to the device's on first launch. */
  locale: Locale;
  searchRadiusKm: number;
  /** Emoji used by the hover quick-react chip in chat. Must be one of
   *  the toggle_reaction RPC whitelist. */
  favoriteReaction: string;
  /** Voice-message speed. Global on purpose: pick 2× once and every
   *  voice note — event chat, group, DM — plays at 2× until you change
   *  it back, which is what Telegram does and what people expect. */
  voiceRate: VoiceRate;

  setPushNotifications: (v: boolean) => void;
  setPushCategory: (c: PushCategory, v: boolean) => void;
  setCalendarSync: (v: boolean) => void;
  setAppearance: (v: Appearance) => void;
  setLocale: (v: Locale) => void;
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
      push: { chat: true, joins: true, events: true, social: true, digest: true },
      calendarSync: false,
      appearance: 'auto',
      locale: deviceLocale(),
      searchRadiusKm: 5,
      favoriteReaction: '❤️',
      voiceRate: 1,

      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setPushCategory: (c, v) =>
        set((s) => ({ push: { ...s.push, [c]: v } })),
      setCalendarSync: (calendarSync) => set({ calendarSync }),
      setAppearance: (appearance) => set({ appearance }),
      setLocale: (locale) => set({ locale }),
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
      // v1 stored a display string ('English'); v2 stores a locale tag.
      // Anyone upgrading had only ever seen English, so map to 'en'
      // rather than re-sniffing the device and changing their UI under
      // them without being asked.
      version: 4,
      migrate: (persisted, from) => {
        const state = (persisted ?? {}) as Record<string, unknown> & {
          locale?: Locale;
          push?: Record<string, boolean>;
          calendarSync?: boolean;
        };
        if (from < 2) {
          delete state.language;
          state.locale = 'en';
        }
        // v3 split the single push toggle into categories. Everyone who
        // had push on keeps everything on; everyone who had it off keeps
        // the master switch off, which still gates the whole thing.
        if (from < 3 || !state.push) {
          state.push = { chat: true, joins: true, events: true, social: true, digest: true };
        }
        if (typeof state.calendarSync !== 'boolean') state.calendarSync = false;
        return state as unknown as PreferencesState;
      },
    },
  ),
);
