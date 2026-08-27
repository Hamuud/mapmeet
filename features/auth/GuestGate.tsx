import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT, type TranslationKey } from '@/i18n';
import type { AuthWallReason } from '@/store/authWall.store';

const HEADLINE: Record<AuthWallReason, TranslationKey> = {
  join: 'wall.join',
  save: 'wall.save',
  chat: 'wall.chat',
  create: 'wall.create',
  events: 'wall.events',
  profile: 'wall.profile',
  generic: 'wall.generic',
};

/** What a signed-out visitor gets in place of a members-only tab.
 *
 *  The tab bar also intercepts the press, but that is a nicety and not
 *  a gate: on web the tabs are real `<a href>` links and React
 *  Navigation's tabPress never fires, and no press handler anywhere
 *  covers somebody following a deep link straight to /events. So the
 *  screen refuses on its own, and the tab listener just makes the
 *  common case feel instant.
 *
 *  A full screen rather than the modal wall, because there is nothing
 *  behind it to go back to — dimming an empty list would be theatre. */
export function GuestGate({ reason }: { reason: AuthWallReason }) {
  const t = useT();

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
          <Ionicons name="lock-closed-outline" size={26} color="#4B5FE0" />
        </View>

        <Text className="text-center text-xl font-bold text-text-light dark:text-text-dark">
          {t(HEADLINE[reason])}
        </Text>
        <Text className="text-center text-[15px] leading-snug text-ink2-light dark:text-ink2-dark">
          {t('wall.body')}
        </Text>

        <Pressable
          onPress={() => router.navigate('/(auth)/signup')}
          className="mt-2 w-full max-w-[320px] items-center rounded-2xl bg-text-light py-3.5 active:opacity-90 dark:bg-text-dark"
        >
          <Text className="text-[15px] font-semibold text-surface-light dark:text-surface-dark">
            {t('wall.createAccount')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.navigate('/(auth)/login')}
          className="w-full max-w-[320px] items-center rounded-2xl border border-border-light py-3.5 active:opacity-80 dark:border-border-dark"
        >
          <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
            {t('wall.signIn')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(tabs)/map')}
          hitSlop={8}
          className="py-1"
        >
          <Text className="text-[13px] font-medium text-muted-light dark:text-muted-dark">
            {t('wall.backToMap')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
