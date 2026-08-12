import { Pressable, Text, View } from 'react-native';

import { PIN_EFFECTS } from '@/features/events/pinStyle';
import { useT } from '@/i18n';
import type { PinColor, PinEffect } from '@/types/database';

import { PinColorField } from './PinColorField';
import { PinGlyphField } from './PinGlyphField';

type Props = {
  color: PinColor | null;
  effect: PinEffect;
  glyphs: string[] | null;
  onColorChange: (color: PinColor | null) => void;
  onEffectChange: (effect: PinEffect) => void;
  onGlyphsChange: (glyphs: string[] | null) => void;
  /** Designer (or owner): unlocks free hex and custom falling emoji. */
  freeform: boolean;
};

/** Colour + effect controls for a styled pin.
 *
 *  Shared by the create wizard's Style step and the edit sheet, so a
 *  subscriber changes their pin the same way whichever door they came
 *  in through. Neither caller should render it without checking
 *  `canStylePin` first — this component is presentation only, and
 *  `freeform` likewise mirrors `canStylePinFreeform`. */
export function PinStyleField({
  color,
  effect,
  glyphs,
  onColorChange,
  onEffectChange,
  onGlyphsChange,
  freeform,
}: Props) {
  const t = useT();

  return (
    <View className="gap-5">
      <PinColorField value={color} onChange={onColorChange} freeform={freeform} />

      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {t('pinStyle.effect')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {PIN_EFFECTS.map((e) => {
            const on = effect === e.key;
            return (
              <Pressable
                key={e.key}
                onPress={() => onEffectChange(e.key)}
                className={[
                  'rounded-xl border px-3.5 py-2.5',
                  on
                    ? 'border-accent-400 bg-accent-400/10'
                    : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
                ].join(' ')}
              >
                <Text
                  className={[
                    'text-[13px] font-semibold',
                    on ? 'text-accent-500' : 'text-text-light dark:text-text-dark',
                  ].join(' ')}
                >
                  {t(e.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Custom particles only mean anything under the falling effect,
          and the DB clears them if the effect moves elsewhere — so the
          picker appears exactly when it applies. */}
      {freeform && effect === 'stars' ? (
        <PinGlyphField value={glyphs} onChange={onGlyphsChange} />
      ) : null}
    </View>
  );
}
