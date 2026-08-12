import type { TranslationKey } from '@/i18n';
import type {
  PinColor,
  PinEffect,
  PinPaletteColor,
  UserRole,
} from '@/types/database';
import { canStylePin, canStylePinFreeform } from '@/utils/roles';

/** The premium palette.
 *
 *  Eight hues, all mid-dark and saturated enough to hold their own over
 *  satellite imagery — a pale pin disappears the moment someone switches
 *  the basemap. Two colours are deliberately missing: ink (#0E0E10),
 *  which means "this pin is selected", and coral (#FE5800), which means
 *  "this is the pin you are placing right now". Letting a subscriber buy
 *  either would break the map's two load-bearing signals.
 *
 *  The designer role is not held to this list — see `isFreeformColor`.
 *
 *  Keys are what's stored; these hexes are free to change. */
export const PIN_COLORS: Record<PinPaletteColor, string> = {
  rose: '#E11D5C',
  amber: '#DE8500',
  lime: '#4E9A1F',
  teal: '#0E9384',
  sky: '#0B84D6',
  indigo: '#4B5FE0',
  violet: '#7C3AED',
  magenta: '#C026D3',
};

export const PIN_COLOR_KEYS = Object.keys(PIN_COLORS) as PinPaletteColor[];

/** Swatches are colour with no text, so the name only ever surfaces to a
 *  screen reader — which is exactly why it has to be translated. */
export const PIN_COLOR_LABEL: Record<PinPaletteColor, TranslationKey> = {
  rose: 'pinStyle.rose',
  amber: 'pinStyle.amber',
  lime: 'pinStyle.lime',
  teal: 'pinStyle.teal',
  sky: 'pinStyle.sky',
  indigo: 'pinStyle.indigo',
  violet: 'pinStyle.violet',
  magenta: 'pinStyle.magenta',
};

/** Mirror of the hex branch of `events_pin_color_check`. */
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** True when the stored value is a raw hex rather than a palette key —
 *  i.e. it came from a designer and needs the freeform entitlement to
 *  render. */
export function isFreeformColor(value: PinColor | null | undefined): boolean {
  return !!value && value.startsWith('#');
}

/** Default falling particle. Designers replace it with their own emoji. */
export const DEFAULT_STAR_GLYPH = '✦';

/** The effect draws three particles; a shorter list cycles. */
export const MAX_EFFECT_GLYPHS = 3;

export const PIN_EFFECTS: { key: PinEffect; labelKey: TranslationKey }[] = [
  { key: 'none', labelKey: 'pinStyle.effectNone' },
  { key: 'glow', labelKey: 'pinStyle.effectGlow' },
  { key: 'stars', labelKey: 'pinStyle.effectStars' },
  { key: 'shine', labelKey: 'pinStyle.effectShine' },
];

/** Effects that move. Native markers are snapshotted to a bitmap unless
 *  `tracksViewChanges` stays on, so the renderer has to know which pins
 *  are worth that cost — see MapMarker. */
export function isAnimatedEffect(effect: PinEffect | null | undefined): boolean {
  return effect === 'glow' || effect === 'stars' || effect === 'shine';
}

export type ResolvedPinStyle = {
  /** Hex fill, or null for the standard paper pin. */
  color: string | null;
  effect: PinEffect;
  /** The falling particles, already resolved to what should be drawn —
   *  a designer's chosen emoji, or the default sparkle. */
  glyphs: string[];
};

const PLAIN: ResolvedPinStyle = {
  color: null,
  effect: 'none',
  glyphs: [DEFAULT_STAR_GLYPH],
};

/** Palette key or raw hex → a hex the renderers can use. */
export function resolveColorValue(
  value: PinColor | null | undefined,
  freeform: boolean,
): string | null {
  if (!value) return null;
  if (isFreeformColor(value)) {
    // Defence in depth. The trigger already refuses to store a hex from
    // an unentitled account, but if one ever got in — a manual fix, a
    // future bug — it must not render for someone who has since lost
    // the role.
    return freeform && HEX_RE.test(value) ? value : null;
  }
  return PIN_COLORS[value as PinPaletteColor] ?? null;
}

/** What a pin should actually look like right now.
 *
 *  The stored choice is only half the answer: the entitlement is checked
 *  against the creator's CURRENT role, so when someone's premium lapses
 *  their pins revert to standard on everyone's map without touching a
 *  single row. Resubscribing brings the old colour straight back. The
 *  same applies one tier up — demote a designer and their free hex and
 *  custom glyphs fall back to nothing and ✦ respectively.
 *
 *  `creatorRole` is optional on ProfileRef and genuinely missing on some
 *  locally-built stubs; treat absent as not entitled, which fails safe to
 *  the standard pin. */
export function resolvePinStyle(
  event: {
    pin_color?: PinColor | null;
    pin_effect?: PinEffect | null;
    pin_effect_emoji?: string[] | null;
  },
  creatorRole: UserRole | null | undefined,
): ResolvedPinStyle {
  if (!canStylePin(creatorRole)) return PLAIN;
  const freeform = canStylePinFreeform(creatorRole);
  const color = resolveColorValue(event.pin_color, freeform);
  const effect = event.pin_effect ?? 'none';
  const custom = freeform ? event.pin_effect_emoji : null;
  const glyphs = custom?.length ? custom : [DEFAULT_STAR_GLYPH];
  // An effect with no colour still reads as premium, so don't require both.
  if (!color && effect === 'none') return PLAIN;
  return { color, effect, glyphs };
}
