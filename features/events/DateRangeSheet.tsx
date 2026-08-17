import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useT } from '@/i18n';
import type { DateRange } from '@/store/filters.store';

type Props = {
  open: boolean;
  value: DateRange;
  onClose: () => void;
  onApply: (range: DateRange) => void;
};

function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Pick a span of days to look at.
 *
 *  The filter bar answers today, tomorrow and this week, then stops — so
 *  "next Saturday", or the week someone is visiting a city, had no way to
 *  be asked. Two fields, because a full calendar for a question this
 *  small would be a heavier component than the feature deserves.
 *
 *  Reversed dates are accepted and swapped rather than rejected: the
 *  intent is obvious and an error message would only be pedantry. */
export function DateRangeSheet({ open, value, onClose, onApply }: Props) {
  const t = useT();
  const [from, setFrom] = useState(value?.from ?? isoDay());
  const [to, setTo] = useState(value?.to ?? isoDay(7));

  // Re-seed whenever it opens, so it reflects whatever is currently
  // filtering rather than the last thing typed and abandoned.
  useEffect(() => {
    if (!open) return;
    setFrom(value?.from ?? isoDay());
    setTo(value?.to ?? isoDay(7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.6} autoHeight>
      <View className="gap-4">
        <View className="gap-1">
          <Text className="font-display text-2xl text-text-light dark:text-text-dark">
            {t('dates.title')}
          </Text>
          <Text className="text-sm text-muted-light dark:text-muted-dark">
            {t('dates.subtitle')}
          </Text>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateTimeField
              mode="date"
              label={t('dates.from')}
              value={from}
              onChange={setFrom}
            />
          </View>
          <View className="flex-1">
            <DateTimeField
              mode="date"
              label={t('dates.to')}
              value={to}
              onChange={setTo}
            />
          </View>
        </View>

        <View className="gap-2">
          <PrimaryButton
            label={t('dates.apply')}
            disabled={!valid}
            onPress={() => {
              onApply(
                from <= to ? { from, to } : { from: to, to: from },
              );
              onClose();
            }}
            fullWidth
          />
          {value ? (
            <PrimaryButton
              label={t('dates.clear')}
              variant="secondary"
              onPress={() => {
                onApply(null);
                onClose();
              }}
              fullWidth
            />
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}
