import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  HEX_RE,
  isFreeformColor,
  PIN_COLOR_KEYS,
  PIN_COLOR_LABEL,
  PIN_COLORS,
} from '@/features/events/pinStyle';
import { useT } from '@/i18n';
import type { PinColor } from '@/types/database';

/** h/s/l → #RRGGBB. Only used to build the spectrum below, once. */
function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Twelve hues at two lightnesses, plus a greyscale run.
 *
 *  This is a shortcut, not the feature — the hex field below it is what
 *  makes the palette genuinely open. A designer with a brand colour
 *  pastes it; a designer browsing taps here. */
const SPECTRUM: string[] = [
  ...Array.from({ length: 12 }, (_, i) => hsl(i * 30, 75, 45)),
  ...Array.from({ length: 12 }, (_, i) => hsl(i * 30, 70, 65)),
  '#000000',
  '#3F3F46',
  '#71717A',
  '#A1A1AA',
  '#D4D4D8',
  '#FFFFFF',
];

type Props = {
  value: PinColor | null;
  onChange: (value: PinColor | null) => void;
  /** Designer (or owner): unlocks the spectrum and the hex field. */
  freeform: boolean;
};

/** Pin colour picker.
 *
 *  Premium gets the eight fixed swatches. The designer role gets those
 *  plus a spectrum and a hex field, which is the whole point of that
 *  tier — see the migration for why everyone else is held to keys. */
export function PinColorField({ value, onChange, freeform }: Props) {
  const t = useT();
  const custom = isFreeformColor(value);

  // Local draft so the user can type '#4B5' without the field fighting
  // them by rejecting every intermediate state. Only a complete, valid
  // hex is pushed up.
  const [draft, setDraft] = useState(custom ? (value as string) : '');
  useEffect(() => {
    if (isFreeformColor(value)) setDraft(value as string);
    else if (value != null) setDraft('');
  }, [value]);

  const draftValid = HEX_RE.test(draft);
  const draftTouched = draft.trim().length > 0;

  const commitDraft = (next: string) => {
    const withHash = next.startsWith('#') ? next : `#${next}`;
    const trimmed = withHash.slice(0, 7).toUpperCase();
    setDraft(trimmed === '#' ? '' : trimmed);
    if (HEX_RE.test(trimmed)) onChange(trimmed);
  };

  const Swatch = ({
    color,
    on,
    label,
    onPress,
  }: {
    color: string;
    on: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className={[
        'h-9 w-9 items-center justify-center rounded-xl border-2',
        on ? 'border-text-light dark:border-text-dark' : 'border-transparent',
      ].join(' ')}
      style={{ backgroundColor: color }}
    >
      {on ? (
        <Ionicons
          name="checkmark"
          size={15}
          // A tick has to survive being dropped on white or on black.
          color={isLight(color) ? '#0E0E10' : '#fff'}
        />
      ) : null}
    </Pressable>
  );

  return (
    <View className="gap-3">
      <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
        {t('pinStyle.colour')}
      </Text>

      <View className="flex-row flex-wrap gap-2.5">
        {/* "Standard" first — the way back to a plain pin has to be as
            easy to reach as the colours themselves. */}
        <Pressable
          onPress={() => onChange(null)}
          accessibilityLabel={t('pinStyle.standard')}
          className={[
            'h-11 w-11 items-center justify-center rounded-2xl border-2',
            value == null
              ? 'border-text-light dark:border-text-dark'
              : 'border-border-light dark:border-border-dark',
          ].join(' ')}
        >
          <Ionicons name="close" size={16} color="#8B8880" />
        </Pressable>

        {PIN_COLOR_KEYS.map((key) => {
          const on = value === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
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

      {freeform ? (
        <View className="gap-3 rounded-2xl border border-border-light bg-panel-light p-3.5 dark:border-border-dark dark:bg-panel-dark">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light dark:text-muted-dark">
            {t('pinStyle.anyColour')}
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {SPECTRUM.map((hex) => (
              <Swatch
                key={hex}
                color={hex}
                on={custom && (value as string).toUpperCase() === hex}
                label={hex}
                onPress={() => onChange(hex)}
              />
            ))}
          </View>

          <View className="flex-row items-center gap-2.5">
            <View
              className="h-11 w-11 rounded-xl border border-border-light dark:border-border-dark"
              style={{ backgroundColor: draftValid ? draft : 'transparent' }}
            />
            <View
              className={[
                'h-11 flex-1 justify-center rounded-xl border px-3.5',
                'bg-elevated-light dark:bg-elevated-dark',
                draftTouched && !draftValid
                  ? 'border-red-500'
                  : 'border-border-light dark:border-border-dark',
              ].join(' ')}
            >
              <TextInput
                value={draft}
                onChangeText={commitDraft}
                placeholder="#7C3AED"
                placeholderTextColor="#8B8880"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                accessibilityLabel={t('pinStyle.hexLabel')}
                className="font-mono text-[15px] text-text-light outline-none dark:text-text-dark"
              />
            </View>
          </View>

          {draftTouched && !draftValid ? (
            <Text className="text-xs text-red-500">{t('pinStyle.hexInvalid')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Rough perceptual lightness — enough to choose a tick colour. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
