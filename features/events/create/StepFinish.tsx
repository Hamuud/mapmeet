import { Ionicons } from '@expo/vector-icons';
import { Controller } from 'react-hook-form';
import { Pressable, Switch, Text, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { useT, useTMaybe } from '@/i18n';
import { useIconColor } from '@/hooks/useIconColor';
import { formatEventDate, formatEventTime } from '@/utils/format';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

type Props = StepProps & {
  /** Jump back to the step that owns a summary row. */
  onJump: (step: number) => void;
};

type RowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  /** Rendered muted — used when the field was left empty. */
  empty?: boolean;
  /** Hairline above the row. NativeWind has no `divide-y`, so the rows
   *  draw their own separators. */
  divided?: boolean;
  onPress: () => void;
  editLabel: string;
  iconColor: string;
};

function SummaryRow({
  icon,
  value,
  empty,
  divided,
  onPress,
  editLabel,
  iconColor,
}: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={editLabel}
      className={[
        'flex-row items-center gap-3 px-4 py-3 active:opacity-60',
        divided ? 'border-t border-border-light dark:border-border-dark' : '',
      ].join(' ')}
    >
      <Ionicons name={icon} size={15} color="#8B8880" />
      <Text
        className={[
          'flex-1 text-[13px]',
          empty
            ? 'italic text-muted-light dark:text-muted-dark'
            : 'text-text-light dark:text-text-dark',
        ].join(' ')}
        numberOfLines={2}
      >
        {value}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={iconColor} />
    </Pressable>
  );
}

/** Step 5 — the two settings nobody thinks about up front, then a
 *  read-back of the whole event.
 *
 *  A wizard hides everything the user typed on the previous screens, so
 *  the last step has to give it back before anything goes live. Each row
 *  jumps to the step that owns it. */
export function StepFinish({ form, onJump }: Props) {
  const t = useT();
  const te = useTMaybe();
  const iconColor = useIconColor();
  const {
    control,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const values = watch();
  const isPrivate = values.visibility === 'private';
  const hasPin = !!values.latitude && !!values.longitude;

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.finishTitle')}
        hint={t('createEvent.finishHint')}
      />

      <Controller
        control={control}
        name="max_participants"
        render={({ field: { value, onChange } }) => (
          <Input
            label={t('createEvent.maxParticipants')}
            keyboardType="number-pad"
            placeholder={t('createEvent.noCap')}
            value={value == null ? '' : String(value)}
            onChangeText={(raw) => {
              const n = Number(raw.replace(/[^0-9]/g, ''));
              onChange(Number.isFinite(n) && n > 0 ? n : null);
            }}
            error={te(errors.max_participants?.message)}
          />
        )}
      />

      <View className="flex-row items-center justify-between rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
        <View className="flex-1 pr-4">
          <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
            {t('createEvent.privateEvent')}
          </Text>
          <Text className="mt-1 text-xs leading-snug text-muted-light dark:text-muted-dark">
            {t('createEvent.privateHint')}
          </Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={(v) => setValue('visibility', v ? 'private' : 'public')}
          trackColor={{ true: '#FE5800' }}
        />
      </View>

      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {t('createEvent.summary')}
        </Text>

        <View className="overflow-hidden rounded-2xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark">
          <SummaryRow
            icon="pricetag-outline"
            value={`${values.emoji}  ${values.title.trim() || t('createEvent.untitled')}`}
            empty={!values.title.trim()}
            onPress={() => onJump(0)}
            editLabel={t('createEvent.editStep', { step: t('createEvent.stepBasics') })}
            iconColor={iconColor}
          />
          <SummaryRow
            icon="document-text-outline"
            value={values.description?.trim() || t('createEvent.noDescription')}
            empty={!values.description?.trim()}
            divided
            onPress={() => onJump(1)}
            editLabel={t('createEvent.editStep', { step: t('createEvent.stepDetails') })}
            iconColor={iconColor}
          />
          <SummaryRow
            icon="calendar-outline"
            value={t('createEvent.startsAt', {
              date: formatEventDate(values.event_date),
              time: formatEventTime(values.event_time),
            })}
            divided
            onPress={() => onJump(2)}
            editLabel={t('createEvent.editStep', { step: t('createEvent.stepWhen') })}
            iconColor={iconColor}
          />
          <SummaryRow
            icon="location-outline"
            value={
              hasPin
                ? (values.address ??
                  `${values.latitude.toFixed(5)}, ${values.longitude.toFixed(5)}`)
                : t('createEvent.noPin')
            }
            empty={!hasPin}
            divided
            onPress={() => onJump(3)}
            editLabel={t('createEvent.editStep', { step: t('createEvent.stepWhere') })}
            iconColor={iconColor}
          />
        </View>

        {/* Tags and the two settings above read back as chips — short
            values that would waste a full row each. */}
        <View className="flex-row flex-wrap items-center gap-1.5">
          {values.tags.map((tag) => (
            <View
              key={tag}
              className="rounded-full bg-brand-500/15 px-2.5 py-1"
            >
              <Text className="font-mono text-[11px] text-brand-500">#{tag}</Text>
            </View>
          ))}
          <View className="rounded-full border border-border-light px-2.5 py-1 dark:border-border-dark">
            <Text className="font-mono text-[11px] text-muted-light dark:text-muted-dark">
              {values.max_participants == null
                ? t('createEvent.capacityNone')
                : t('createEvent.capacityValue', {
                    count: values.max_participants,
                  })}
            </Text>
          </View>
          <View className="rounded-full border border-border-light px-2.5 py-1 dark:border-border-dark">
            <Text className="font-mono text-[11px] text-muted-light dark:text-muted-dark">
              {isPrivate
                ? t('createEvent.visibilityPrivate')
                : t('createEvent.visibilityPublic')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
