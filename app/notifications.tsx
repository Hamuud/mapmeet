import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { useT, type TranslationKey } from '@/i18n';
import {
  usePreferencesStore,
  type PushCategory,
} from '@/store/preferences.store';

type Row = {
  key: PushCategory;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: TranslationKey;
  hint: TranslationKey;
};

/** Grouped by what a person would actually want to silence: the chatty
 *  ones, the ones about events they've committed to, the social ones,
 *  and the one that is us reaching out rather than someone else. */
const ROWS: Row[] = [
  {
    key: 'chat',
    icon: 'chatbubble-outline',
    label: 'notif.chat',
    hint: 'notif.chatHint',
  },
  {
    key: 'joins',
    icon: 'person-add-outline',
    label: 'notif.joins',
    hint: 'notif.joinsHint',
  },
  {
    key: 'events',
    icon: 'calendar-outline',
    label: 'notif.events',
    hint: 'notif.eventsHint',
  },
  {
    key: 'social',
    icon: 'people-outline',
    label: 'notif.social',
    hint: 'notif.socialHint',
  },
  {
    key: 'digest',
    icon: 'map-outline',
    label: 'notif.digest',
    hint: 'notif.digestHint',
  },
];

export default function NotificationsScreen() {
  const t = useT();
  const iconColor = useIconColor();
  const master = usePreferencesStore((s) => s.pushNotifications);
  const setMaster = usePreferencesStore((s) => s.setPushNotifications);
  const categories = usePreferencesStore((s) => s.push);
  const setCategory = usePreferencesStore((s) => s.setPushCategory);
  const radiusKm = usePreferencesStore((s) => s.searchRadiusKm);
  const { coords } = useLocation();

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-row items-center gap-2.5 border-b border-border-light px-3 py-3 dark:border-border-dark">
        <Ionicons
          name="chevron-back"
          size={20}
          color={iconColor}
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
        />
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          {t('notif.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="overflow-hidden rounded-2xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark">
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
              <Ionicons name="notifications-outline" size={16} color={iconColor} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                {t('notif.master')}
              </Text>
              <Text className="text-xs leading-snug text-muted-light dark:text-muted-dark">
                {t('notif.masterHint')}
              </Text>
            </View>
            <Switch
              value={master}
              onValueChange={setMaster}
              trackColor={{ true: '#0E0E10' }}
            />
          </View>
        </View>

        <View
          className="overflow-hidden rounded-2xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
          // Everything below is moot with the master switch off; dim it
          // rather than hiding it, so it's clear what turning it back on
          // would restore.
          style={{ opacity: master ? 1 : 0.45 }}
          pointerEvents={master ? 'auto' : 'none'}
        >
          {ROWS.map((row, i) => (
            <View
              key={row.key}
              className={[
                'flex-row items-center gap-3 px-4 py-3.5',
                i > 0 ? 'border-t border-border-light dark:border-border-dark' : '',
              ].join(' ')}
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
                <Ionicons name={row.icon} size={16} color={iconColor} />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                  {t(row.label)}
                </Text>
                <Text className="text-xs leading-snug text-muted-light dark:text-muted-dark">
                  {t(row.hint)}
                </Text>
              </View>
              <Switch
                value={categories[row.key]}
                onValueChange={(v) => setCategory(row.key, v)}
                trackColor={{ true: '#0E0E10' }}
              />
            </View>
          ))}
        </View>

        {/* What "your area" resolves to, in plain terms — otherwise the
            digest switch is a promise with no visible terms. */}
        <View className="gap-1.5 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('notif.areaTitle')}
          </Text>
          <Text className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark">
            {coords
              ? t('notif.areaBody', { km: radiusKm })
              : t('notif.areaNoLocation')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
