import { Text, View } from 'react-native';

import { currentBcp47, useT } from '@/i18n';

/** Date group header between message clusters — "— TODAY —" style. */
export function DateSeparator({ iso }: { iso: string }) {
  const t = useT();
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const label = sameDay(d, today)
    ? t('time.today')
    : sameDay(d, yesterday)
      ? t('time.yesterday')
      : d.toLocaleDateString(currentBcp47(), {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

  return (
    <View className="my-3 flex-row items-center gap-3 px-8">
      <View className="h-px flex-1 bg-border-light dark:bg-border-dark" />
      <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
        {label}
      </Text>
      <View className="h-px flex-1 bg-border-light dark:bg-border-dark" />
    </View>
  );
}

/** Calendar-day key for grouping messages. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
