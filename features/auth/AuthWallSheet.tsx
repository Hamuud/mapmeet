import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Modal, Pressable, Text, View } from 'react-native';

import { useT, type TranslationKey } from '@/i18n';
import { useAuthWallStore, type AuthWallReason } from '@/store/authWall.store';

/** Headline per reason. The body is shared — what differs is what the
 *  person was reaching for when they hit the wall. */
const HEADLINE: Record<AuthWallReason, TranslationKey> = {
  join: 'wall.join',
  save: 'wall.save',
  chat: 'wall.chat',
  create: 'wall.create',
  events: 'wall.events',
  profile: 'wall.profile',
  generic: 'wall.generic',
};

const ICON: Record<AuthWallReason, React.ComponentProps<typeof Ionicons>['name']> = {
  join: 'hand-right-outline',
  save: 'bookmark-outline',
  chat: 'chatbubbles-outline',
  create: 'add-circle-outline',
  events: 'calendar-outline',
  profile: 'person-outline',
  generic: 'lock-closed-outline',
};

/** The sign-in prompt a guest meets when they reach for something that
 *  needs an identity.
 *
 *  Mounted once in the tabs layout and opened by the store, exactly like
 *  RestrictionDialog — a guest can hit this from a dozen places and none
 *  of them should carry their own copy of it.
 *
 *  "Create account" leads, not "Sign in": everyone who reaches this
 *  screen by definition does not have an account yet, and putting the
 *  returning-member action first makes the common case the second
 *  choice. "Not now" stays deliberately quiet but present — a wall with
 *  no way back turns a browse into a bounce. */
export function AuthWallSheet() {
  const t = useT();
  const open = useAuthWallStore((s) => s.open);
  const reason = useAuthWallStore((s) => s.reason);
  const hide = useAuthWallStore((s) => s.hide);

  const go = (path: '/(auth)/signup' | '/(auth)/login') => {
    hide();
    router.navigate(path);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={hide}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-[400px] gap-3 rounded-3xl bg-panel-light p-6 dark:bg-panel-dark">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
            <Ionicons name={ICON[reason]} size={24} color="#4B5FE0" />
          </View>

          <Text className="text-xl font-bold text-text-light dark:text-text-dark">
            {t(HEADLINE[reason])}
          </Text>

          <Text className="text-[15px] leading-snug text-ink2-light dark:text-ink2-dark">
            {t('wall.body')}
          </Text>

          <Pressable
            onPress={() => go('/(auth)/signup')}
            className="mt-1 items-center rounded-2xl bg-text-light py-3.5 active:opacity-90 dark:bg-text-dark"
          >
            <Text className="text-[15px] font-semibold text-surface-light dark:text-surface-dark">
              {t('wall.createAccount')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => go('/(auth)/login')}
            className="items-center rounded-2xl border border-border-light py-3.5 active:opacity-80 dark:border-border-dark"
          >
            <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
              {t('wall.signIn')}
            </Text>
          </Pressable>

          <Pressable onPress={hide} hitSlop={8} className="items-center py-1">
            <Text className="text-[13px] font-medium text-muted-light dark:text-muted-dark">
              {t('wall.notNow')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
