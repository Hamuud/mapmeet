import { Controller } from 'react-hook-form';
import { Text, View } from 'react-native';

import { TagsField } from '@/components/events/TagsField';
import { Input } from '@/components/ui/Input';
import { useT, useTMaybe } from '@/i18n';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Step 2 — the free-text half: description and tags. */
export function StepDetails({ form }: StepProps) {
  const t = useT();
  const te = useTMaybe();
  const {
    control,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const tags = watch('tags');
  const description = watch('description') ?? '';

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.detailsTitle')}
        hint={t('createEvent.detailsHint')}
      />

      <View>
        <Controller
          control={control}
          name="description"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              label={t('createEvent.description')}
              placeholder={t('createEvent.descriptionPlaceholder')}
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              maxLength={500}
              error={te(errors.description?.message)}
            />
          )}
        />
        <Text className="mt-1.5 text-right text-[11px] text-muted-light dark:text-muted-dark">
          {t('createEvent.charsLeft', { count: 500 - description.length })}
        </Text>
      </View>

      <TagsField
        value={tags}
        onChange={(next) => setValue('tags', next, { shouldValidate: true })}
        error={te(errors.tags?.message)}
      />
    </View>
  );
}
