import { Pressable, ScrollView, Text, View } from 'react-native';

import { useT, type TranslationKey } from '@/i18n';
import type { EventFilter } from '@/types';

const FILTERS: { key: EventFilter; labelKey: TranslationKey }[] = [
  { key: 'all',      labelKey: 'filter.all' },
  { key: 'today',    labelKey: 'filter.today' },
  { key: 'tomorrow', labelKey: 'filter.tomorrow' },
  { key: 'week',     labelKey: 'filter.week' },
  // Today / tomorrow / this week and then nothing: anyone looking at next
  // Saturday, or planning a trip, had no way to ask. This one opens a
  // picker rather than filtering on tap.
  { key: 'dates',    labelKey: 'filter.dates' },
  { key: 'nearby',   labelKey: 'filter.nearby' },
  { key: 'joined',   labelKey: 'filter.joined' },
  { key: 'created',  labelKey: 'filter.created' },
];

type Props = {
  value: EventFilter;
  onChange: (filter: EventFilter) => void;
  /** Label for the Dates chip once a range is chosen — "20–23 Aug"
   *  rather than the generic word, so the bar shows what is being asked
   *  without opening the picker again. */
  dateLabel?: string | null;
  /** Tapping the Dates chip opens the picker instead of just switching
   *  the filter; the map screen owns the sheet. */
  onPickDates?: () => void;
};

export function FilterBar({ value, onChange, dateLabel, onPickDates }: Props) {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}
    >
      {FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() =>
              f.key === 'dates' && onPickDates ? onPickDates() : onChange(f.key)
            }
            className={[
              'h-8 flex-row items-center justify-center rounded-full px-3.5',
              active
                ? 'bg-text-light dark:bg-text-dark'
                : 'bg-panel-light dark:bg-panel-dark border border-border-light dark:border-border-dark',
            ].join(' ')}
          >
            {active ? (
              <View className="mr-1.5 h-1 w-1 rounded-full bg-surface-light dark:bg-surface-dark opacity-70" />
            ) : null}
            <Text
              className={[
                'text-xs font-semibold',
                active
                  ? 'text-surface-light dark:text-surface-dark'
                  : 'text-text-light/85 dark:text-text-dark/85',
              ].join(' ')}
            >
              {f.key === 'dates' && dateLabel ? dateLabel : t(f.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
