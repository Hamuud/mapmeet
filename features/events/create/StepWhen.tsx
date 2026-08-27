import { Ionicons } from '@expo/vector-icons';
import { Controller } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { DateTimeField } from '@/components/ui/DateTimeField';
import { useT, useTMaybe } from '@/i18n';
import { formatEventDate, formatEventTime } from '@/utils/format';
import { EVENT_GRACE_MINUTES, eventStart } from '@/utils/eventTime';

import { useModerationStore } from '@/store/moderation.store';
import { canRepeatEvents } from '@/utils/roles';
import { REPEAT_OPTIONS, type RepeatOption } from '@/utils/validators';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

const REPEAT_LABEL: Record<RepeatOption, 'createEvent.repeatNone' | 'createEvent.repeatWeekly' | 'createEvent.repeatFortnightly' | 'createEvent.repeatMonthly'> = {
  none: 'createEvent.repeatNone',
  weekly: 'createEvent.repeatWeekly',
  fortnightly: 'createEvent.repeatFortnightly',
  monthly: 'createEvent.repeatMonthly',
};

/** `YYYY-MM-DD` for today plus `offsetDays`, in local time — the same
 *  interpretation `eventStart` uses when it reads the field back. */
function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Step 3 — when it starts.
 *
 *  The warning matters more than it looks: an event whose start time has
 *  already passed (plus the grace window) is filtered off the map the
 *  moment it is created, so without this the user pins something and
 *  then cannot find it. It stays a warning rather than a hard block —
 *  backdating by a few minutes is legitimate for something already
 *  under way. */
export function StepWhen({ form }: StepProps) {
  const t = useT();
  const te = useTMaybe();
  const role = useModerationStore((st) => st.role);
  const canRepeat = canRepeatEvents(role);
  const {
    control,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const date = watch('event_date');
  const time = watch('event_time');

  const start = eventStart({ event_date: date, event_time: time });
  const isPast = start
    ? start.getTime() + EVENT_GRACE_MINUTES * 60_000 < Date.now()
    : false;

  const quickDates: { label: string; value: string }[] = [
    { label: t('createEvent.today'), value: isoDate(0) },
    { label: t('createEvent.tomorrow'), value: isoDate(1) },
  ];

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.whenTitle')}
        hint={t('createEvent.whenHint')}
      />

      <View className="flex-row gap-2">
        {quickDates.map((q) => {
          const active = date === q.value;
          return (
            <Pressable
              key={q.value}
              onPress={() =>
                setValue('event_date', q.value, { shouldValidate: true })
              }
              className={[
                'flex-1 items-center justify-center rounded-xl border py-2.5',
                active
                  ? 'border-accent-400 bg-accent-400/10'
                  : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
              ].join(' ')}
            >
              <Text
                className={[
                  'text-sm font-semibold',
                  active
                    ? 'text-accent-500'
                    : 'text-text-light dark:text-text-dark',
                ].join(' ')}
              >
                {q.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Controller
            control={control}
            name="event_date"
            render={({ field: { value, onChange } }) => (
              <DateTimeField
                mode="date"
                label={t('createEvent.date')}
                value={value}
                onChange={onChange}
                error={te(errors.event_date?.message)}
              />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="event_time"
            render={({ field: { value, onChange } }) => (
              <DateTimeField
                mode="time"
                label={t('createEvent.time')}
                value={value}
                onChange={onChange}
                error={te(errors.event_time?.message)}
              />
            )}
          />
        </View>
      </View>

      {start ? (
        <View
          className={[
            'flex-row items-start gap-2.5 rounded-2xl border p-4',
            isPast
              ? 'border-red-300 bg-red-500/5'
              : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
          ].join(' ')}
        >
          <Ionicons
            name={isPast ? 'alert-circle-outline' : 'time-outline'}
            size={16}
            color={isPast ? '#B91C1C' : '#8B8880'}
            style={{ marginTop: 1 }}
          />
          <View className="flex-1 gap-1">
            <Text className="text-[13px] font-semibold text-text-light dark:text-text-dark">
              {t('createEvent.startsAt', {
                date: formatEventDate(date),
                time: formatEventTime(time),
              })}
            </Text>
            <Text
              className={[
                'text-[12px] leading-snug',
                isPast ? 'text-red-600' : 'text-muted-light dark:text-muted-dark',
              ].join(' ')}
            >
              {isPast
                ? t('createEvent.pastWarning')
                : t('createEvent.staysOnMap')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Repeat — premium only. Lives on the When step because "every
          Wednesday" is part of answering "when?", not a separate
          decision. Everyone else never sees it, and set_event_repeat
          re-checks the entitlement server-side regardless. */}
      {canRepeat ? (
        <Controller
          control={control}
          name="repeat"
          render={({ field: { value, onChange } }) => (
            <View className="gap-2">
              <Text className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
                {t('createEvent.repeatLabel')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {REPEAT_OPTIONS.map((opt) => {
                  const on = value === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => onChange(opt)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      className={[
                        'rounded-xl border px-3.5 py-2',
                        on
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                      ].join(' ')}
                    >
                      <Text
                        className={[
                          'text-[13px] font-semibold',
                          on
                            ? 'text-brand-500'
                            : 'text-text-light dark:text-text-dark',
                        ].join(' ')}
                      >
                        {t(REPEAT_LABEL[opt])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {value !== 'none' ? (
                <Text className="text-[12px] leading-snug text-muted-light dark:text-muted-dark">
                  {t('createEvent.repeatHint')}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : null}
    </View>
  );
}
