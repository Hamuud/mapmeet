import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useT } from '@/i18n';

export default function NotFoundScreen() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View className="flex-1 items-center justify-center gap-4 bg-surface-light p-6 dark:bg-surface-dark">
        <Text className="text-6xl">🧭</Text>
        <Text className="text-xl font-semibold text-text-light dark:text-text-dark">
          {t('notFound.body')}
        </Text>
        <Link href="/" className="text-brand-500">
          {t('notFound.goHome')}
        </Link>
      </View>
    </>
  );
}
