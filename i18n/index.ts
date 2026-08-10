import { en, type TranslationKey } from './en';
import { resolve, type Locale, type Vars } from './types';
import { uk } from './uk';
import { usePreferencesStore } from '@/store/preferences.store';

export { LOCALES, LOCALE_LABEL } from './types';
export type { Locale } from './types';
export type { TranslationKey } from './en';

const DICTS = { en, uk } as const;

export type TFunction = (key: TranslationKey, vars?: Vars) => string;

/** Translate outside React — services, stores, one-off helpers. Reads the
 *  store directly, so it always reflects the current choice. Inside a
 *  component prefer `useT()`, which also re-renders on a language switch. */
export function t(key: TranslationKey, vars?: Vars): string {
  return translateIn(usePreferencesStore.getState().locale, key, vars);
}

export function translateIn(locale: Locale, key: TranslationKey, vars?: Vars): string {
  // Fall back to English rather than rendering a raw key: a missing
  // translation should look like an untranslated app, not a broken one.
  const phrase = DICTS[locale]?.[key] ?? en[key];
  if (phrase === undefined) return key;
  return resolve(phrase, locale, vars);
}

/** The hook every component uses. Subscribing to `locale` is what makes
 *  the whole UI repaint the instant it changes. */
export function useT(): TFunction {
  const locale = usePreferencesStore((s) => s.locale);
  return (key, vars) => translateIn(locale, key, vars);
}

/** True when a string is one of our keys. Lets a value that might be a
 *  key (a zod message, a caught error) be translated opportunistically. */
export function isKey(s: string): s is TranslationKey {
  return s in en;
}

/** Translate `s` if it happens to be a translation key, otherwise return
 *  it untouched. Form validation stores keys as zod messages, and errors
 *  thrown by Postgres arrive as plain prose — this handles both without
 *  the call site having to know which it got. */
export function useTMaybe(): (s: string | undefined | null) => string | undefined {
  const locale = usePreferencesStore((s) => s.locale);
  return (s) => {
    if (s === undefined || s === null) return undefined;
    return isKey(s) ? translateIn(locale, s) : s;
  };
}

/** Non-hook twin of useTMaybe, for catch blocks in services. */
export function tMaybe(s: string | undefined | null): string | undefined {
  if (s === undefined || s === null) return undefined;
  return isKey(s) ? t(s) : s;
}

/** For the handful of places that need the tag itself — `Intl` calls,
 *  `lang` attributes. */
export function useLocale(): Locale {
  return usePreferencesStore((s) => s.locale);
}

/** BCP-47 tag for `Intl` / `toLocaleDateString`. */
export const BCP47: Record<Locale, string> = {
  en: 'en-GB',
  uk: 'uk-UA',
};

export function currentBcp47(): string {
  return BCP47[usePreferencesStore.getState().locale];
}
