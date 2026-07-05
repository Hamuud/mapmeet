import { Pressable, ScrollView, Text, View } from 'react-native';

import type { EventFilter } from '@/types';

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'today',    label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week',     label: 'This week' },
  { key: 'nearby',   label: 'Nearby' },
  { key: 'joined',   label: 'Joined' },
  { key: 'created',  label: 'By me' },
];

type Props = {
  value: EventFilter;
  onChange: (filter: EventFilter) => void;
};

export function FilterBar({ value, onChange }: Props) {
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
            onPress={() => onChange(f.key)}
            className={[
              'h-8 flex-row items-center justify-center rounded-full px-3.5',
              active
                ? 'bg-text-light dark:bg-text-dark'
                : 'bg-panel-light/92 dark:bg-panel-dark/92 border border-border-light dark:border-border-dark',
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
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
