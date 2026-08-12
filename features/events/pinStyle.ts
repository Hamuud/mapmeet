import type { TranslationKey } from '@/i18n';
import type { PinColor, PinEffect, UserRole } from '@/types/database';
import { canStylePin } from '@/utils/roles';

/** The premium palette.
 *
 *  Eight hues, all mid-dark and saturated enough to hold their own over
 *  satellite imagery — a pale pin disappears the moment someone switches
 *  the basemap. Two colours are deliberately missing: ink (#0E0E10),
 *  which means "this pin is selected", and coral (#FE5800), which means
 *  "this is the pin you are placing right now". Letting a subscriber buy
 *  either would break the map's two load-bearing signals.
 *
 *  Keys are what's stored; these hexes are free to change. */
export const PIN_COLORS: Record<PinColor, string> = {
  rose: '#E11D5C',
  amber: '#DE8500',
  lime: '#4E9A1F',
  teal: '#0E9384',
  sky: '#0B84D6',
  indigo: '#4B5FE0',
  violet: '#7C3AED',
  magenta: '#C026D3',
};

export const PIN_COLOR_KEYS = Object.keys(PIN_COLORS) as PinColor[];

/** Swatches are colour with no text, so the name only ever surfaces to a
 *  screen reader — which is exactly why it has to be translated. */
export const PIN_COLOR_LABEL: Record<PinColor, TranslationKey> = {
  rose: 'pinStyle.rose',
  amber: 'pinStyle.amber',
  lime: 'pinStyle.lime',
  teal: 'pinStyle.teal',
  sky: 'pinStyle.sky',
  indigo: 'pinStyle.indigo',
  violet: 'pinStyle.violet',
  magenta: 'pinStyle.magenta',
};

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
};

const PLAIN: ResolvedPinStyle = { color: null, effect: 'none' };

/** What a pin should actually look like right now.
 *
 *  The stored choice is only half the answer: the entitlement is checked
 *  against the creator's CURRENT role, so when someone's premium lapses
 *  their pins revert to standard on everyone's map without touching a
 *  single row. Resubscribing brings the old colour straight back.
 *
 *  `creatorRole` is optional on ProfileRef and genuinely missing on some
 *  locally-built stubs; treat absent as not entitled, which fails safe to
 *  the standard pin. */
export function resolvePinStyle(
  event: { pin_color?: PinColor | null; pin_effect?: PinEffect | null },
  creatorRole: UserRole | null | undefined,
): ResolvedPinStyle {
  if (!canStylePin(creatorRole)) return PLAIN;
  const color = event.pin_color ? (PIN_COLORS[event.pin_color] ?? null) : null;
  const effect = event.pin_effect ?? 'none';
  // An effect with no colour still reads as premium, so don't require both.
  if (!color && effect === 'none') return PLAIN;
  return { color, effect };
}
