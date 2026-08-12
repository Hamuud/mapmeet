import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import {
  PIN_COLOR_KEYS,
  PIN_COLOR_LABEL,
  PIN_COLORS,
  PIN_EFFECTS,
} from '@/features/events/pinStyle';
import { useT } from '@/i18n';
import type { PinColor, PinEffect } from '@/types/database';

type Props = {
  color: PinColor | null;
  effect: PinEffect;
  onColorChange: (color: PinColor | null) => void;
  onEffectChange: (effect: PinEffect) => void;
};

/** Colour swatches + effect chips for a premium pin.
 *
 *  Shared by the create wizard's Style step and the edit sheet, so a
 *  subscriber changes their pin the same way whichever door they came
 *  in through. Neither caller should render it without checking
 *  `canStylePin` first — this component is presentation only. */
export function PinStyleField({
  color,
  effect,
  onColorChange,
  onEffectChange,
}: Props) {
  const t = useT();

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {t('pinStyle.colour')}
        </Text>
        <View className="flex-row flex-wrap gap-2.5">
          {/* "Standard" first — the way back to a plain pin has to be as
              easy to reach as the colours themselves. */}
          <Pressable
            onPress={() => onColorChange(null)}
            accessibilityLabel={t('pinStyle.standard')}
            className={[
              'h-11 w-11 items-center justify-center rounded-2xl border-2',
              color == null
                ? 'border-text-light dark:border-text-dark'
                : 'border-border-light dark:border-border-dark',
            ].join(' ')}
          >
            <Ionicons
              name="close"
              size={16}
              color={color == null ? '#8B8880' : '#8B8880'}
            />
          </Pressable>

          {PIN_COLOR_KEYS.map((key) => {
            const on = color === key;
            return (
              <Pressable
                key={key}
                onPress={() => onColorChange(key)}
                accessibilityLabel={t(PIN_COLOR_LABEL[key])}
                className={[
                  'h-11 w-11 items-center justify-center rounded-2xl border-2',
                  on
                    ? 'border-text-light dark:border-text-dark'
                    : 'border-transparent',
                ].join(' ')}
                style={{ backgroundColor: PIN_COLORS[key] }}
              >
                {on ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

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
    </View>
  );
}
