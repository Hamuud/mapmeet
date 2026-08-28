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
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useT } from '@/i18n';
import type { PinColor } from '@/types/database';

/** Where the picker starts when a designer opens it on a palette colour
 *  or on Standard — a mid violet, far enough from the eight palette hues
 *  to read as "this is the free one". */
const PICKER_SEED = '#7C3AED';

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
  // What the picker shows when the current selection isn't a free colour
  // — on Standard, or on one of the eight palette keys, which are names
  // rather than hexes. It stays put until the user drags, so opening the
  // picker never silently changes the pin.
  const pickerValue = custom ? (value as string) : PICKER_SEED;

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

          {/* Drag, don't type. The grid of pre-mixed swatches this
              replaces could only ever offer a sample of the space, and
              the hex field below it made picking a colour a matter of
              knowing its code — fine for matching a brand, useless for
              choosing one. The square and strip are the whole gamut. */}
          <ColorPicker value={pickerValue} onChange={onChange} />

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
