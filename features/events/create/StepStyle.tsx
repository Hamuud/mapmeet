import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { PinStyleField } from '@/components/events/PinStyleField';
import { MapMarker } from '@/components/map/MapMarker';
import { PIN_COLORS } from '@/features/events/pinStyle';
import { useT } from '@/i18n';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Step 2, premium and staff only — the pin's colour and effect.
 *
 *  The step is a live preview with the controls under it: every choice
 *  here is purely visual, so showing the result is the only honest way
 *  to present it. Nothing is required — "Standard" is a real answer and
 *  Continue works untouched. */
export function StepStyle({ form }: StepProps) {
  const t = useT();
  const { setValue, watch } = form;

  const emoji = watch('emoji');
  const title = watch('title');
  const visibility = watch('visibility');
  const color = watch('pin_color');
  const effect = watch('pin_effect') ?? 'none';

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.styleTitle')}
        hint={t('createEvent.styleHint')}
      />

      <View className="items-center gap-2 rounded-2xl border border-border-light bg-elevated-light py-6 dark:border-border-dark dark:bg-elevated-dark">
        <View style={{ maxWidth: 240 }}>
          <MapMarker
            emoji={emoji || '❓'}
            title={title.trim() || t('createEvent.untitled')}
            isPrivate={visibility === 'private'}
            pinColor={color ? PIN_COLORS[color] : null}
            pinEffect={effect}
          />
        </View>
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light dark:text-muted-dark">
          {t('createEvent.pinPreview')}
        </Text>
      </View>

      <PinStyleField
        color={color}
        effect={effect}
        onColorChange={(v) => setValue('pin_color', v, { shouldDirty: true })}
        onEffectChange={(v) => setValue('pin_effect', v, { shouldDirty: true })}
      />

      <View className="flex-row items-start gap-2.5 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
        <Ionicons
          name="sparkles-outline"
          size={15}
          color="#D98C00"
          style={{ marginTop: 1 }}
        />
        <Text className="flex-1 text-[12px] leading-snug text-muted-light dark:text-muted-dark">
          {t('pinStyle.perkNote')}
        </Text>
      </View>
    </View>
  );
}
