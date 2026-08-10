import { Text, View } from 'react-native';

import { useT } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import type { Profile } from '@/types';

type Props = {
  profile: Profile;
  createdCount: number;
  joinedCount: number;
};

export function ProfileCard({ profile, createdCount, joinedCount }: Props) {
  const t = useT();
  return (
    <View
      className={[
        'items-center rounded-3xl border p-6',
        'border-border-light bg-surface-light',
        'dark:border-border-dark dark:bg-elevated-dark',
      ].join(' ')}
    >
      <Avatar name={profile.display_name} uri={profile.avatar_url} size="xl" />
      <Text className="mt-3 text-xl font-semibold text-text-light dark:text-text-dark">
        {profile.display_name}
      </Text>
      <Text className="text-sm text-muted-light dark:text-muted-dark">
        @{profile.username}
      </Text>

      <View className="mt-5 w-full flex-row justify-around">
        <Stat label={t('card.created')} value={createdCount} />
        <View className="w-px bg-border-light dark:bg-border-dark" />
        <Stat label={t('card.joined')} value={joinedCount} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center">
      <Text className="text-xl font-semibold text-text-light dark:text-text-dark">
        {value}
      </Text>
      <Text className="text-xs text-muted-light dark:text-muted-dark">{label}</Text>
    </View>
  );
}
