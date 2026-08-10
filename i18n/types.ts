/** MapMeet — i18n primitives.
 *
 *  No library: the whole thing is a typed dictionary plus a lookup that
 *  subscribes to the preferences store, so switching language re-renders
 *  every screen for free and nothing extra ships in the bundle.
 *
 *  The one rule that keeps it honest: `en.ts` is the source of truth and
 *  every other locale is typed as `Record<TranslationKey, Phrase>`. Add
 *  an English string without its Ukrainian twin and the build fails. */

export type Locale = 'en' | 'uk';

export const LOCALES: Locale[] = ['en', 'uk'];

/** What each language calls itself — never translated. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
};

/** Slavic languages need three forms where English needs two, so a
 *  phrase is either a plain string or the set of forms for a count.
 *  `other` doubles as English's plural and Ukrainian's genitive-plural. */
export type PluralForms = {
  one: string;
  /** Ukrainian 2–4. Ignored by English. */
  few?: string;
  other: string;
};

export type Phrase = string | PluralForms;

/** Values interpolated into `{placeholders}`. `count` also selects the
 *  plural form. */
export type Vars = Record<string, string | number>;

/** CLDR plural category, reduced to what we actually author. */
function pluralCategory(locale: Locale, n: number): 'one' | 'few' | 'other' {
  const abs = Math.abs(n);
  if (locale === 'en') return abs === 1 ? 'one' : 'other';

  // Ukrainian: 1, 21, 31… → one; 2-4, 22-24… → few; 0, 5-20, 25-30… → other
  // (`other` is the genitive plural: «5 учасників»).
  if (!Number.isInteger(abs)) return 'other';
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'other';
}

/** Pick the right form, then substitute `{vars}`. */
export function resolve(phrase: Phrase, locale: Locale, vars?: Vars): string {
  let out: string;
  if (typeof phrase === 'string') {
    out = phrase;
  } else {
    const n = typeof vars?.count === 'number' ? vars.count : 0;
    const category = pluralCategory(locale, n);
    out = (category === 'few' ? phrase.few : undefined) ?? phrase[category === 'one' ? 'one' : 'other'];
  }
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
