import { Controller } from 'react-hook-form';
import { Text, View } from 'react-native';

import { EmojiPicker } from '@/components/events/EmojiPicker';
import { MapMarker } from '@/components/map/MapMarker';
import { Input } from '@/components/ui/Input';
import { useT, useTMaybe } from '@/i18n';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Step 1 — what the thing is called and which emoji marks it.
 *
 *  The live pin preview is the point of putting these two fields
 *  together: title and emoji are the only parts of an event a passer-by
 *  sees on the map, so the user gets to see exactly that while choosing
 *  them. */
export function StepBasics({ form }: StepProps) {
  const t = useT();
  const te = useTMaybe();
  const {
    control,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const emoji = watch('emoji');
  const title = watch('title');
  const visibility = watch('visibility');

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.basicsTitle')}
        hint={t('createEvent.basicsHint')}
      />

      <View className="items-center gap-2 rounded-2xl border border-border-light bg-elevated-light py-5 dark:border-border-dark dark:bg-elevated-dark">
        {/* Cap the width so a long title doesn't stretch the marker's
            label pill across the whole sheet. */}
        <View style={{ maxWidth: 240 }}>
          <MapMarker
            emoji={emoji || '❓'}
            title={title.trim() || t('createEvent.untitled')}
            isPrivate={visibility === 'private'}
            hosted
          />
        </View>
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light dark:text-muted-dark">
          {t('createEvent.pinPreview')}
        </Text>
      </View>

      <Controller
        control={control}
        name="title"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label={t('createEvent.eventTitle')}
            placeholder={t('createEvent.titlePlaceholder')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            maxLength={80}
            error={te(errors.title?.message)}
          />
        )}
      />

      <View>
        <Text className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {t('createEvent.emoji')}
        </Text>
        <EmojiPicker
          value={emoji}
          onChange={(v) => setValue('emoji', v, { shouldValidate: true })}
        />
        {errors.emoji?.message ? (
          <Text className="mt-1.5 text-xs text-red-500">
            {te(errors.emoji.message)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
