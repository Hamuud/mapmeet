import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { DeleteAccountSheet } from '@/features/settings/DeleteAccountSheet';
import { FeedbackSheet } from '@/features/settings/FeedbackSheet';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor, useMutedIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { LOCALE_LABEL, LOCALES, useT, type Locale } from '@/i18n';
import { usePreferencesStore, type Appearance } from '@/store/preferences.store';
import { goBack } from '@/utils/nav';

const APPEARANCE_OPTIONS: readonly Appearance[] = ['light', 'dark', 'auto'] as const;
const APPEARANCE_LABEL = {
  light: 'settings.appearanceLight',
  dark: 'settings.appearanceDark',
  auto: 'settings.appearanceAuto',
} as const;
const RADII_KM = [1, 3, 5, 10, 25, 50] as const;

/** MapMeet Settings screen. Reachable from the "You" tab. Groups:
 *  Account (profile + privacy + location), Preferences (notifications,
 *  appearance, language, search radius), and Support (help/feedback/
 *  legal). Sign-out at the bottom, version footer. */
export default function SettingsScreen() {
  const t = useT();
  const toast = useToast();
  const iconColor = useIconColor();
  const { profile, signOut } = useAuth();
  const { status: locStatus, request: requestLocation } = useLocation();

  const pushNotifications = usePreferencesStore((s) => s.pushNotifications);
  const setPushNotifications = usePreferencesStore((s) => s.setPushNotifications);
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const searchRadiusKm = usePreferencesStore((s) => s.searchRadiusKm);
  const setSearchRadiusKm = usePreferencesStore((s) => s.setSearchRadiusKm);
  const favoriteReaction = usePreferencesStore((s) => s.favoriteReaction);
  const setFavoriteReaction = usePreferencesStore((s) => s.setFavoriteReaction);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const version =
    (Constants.expoConfig?.version as string | undefined) ??
    (Constants.manifest2 as { extra?: { version?: string } } | undefined)?.extra?.version ??
    '0.1.0';

  const handleSignOut = async () => {
    setConfirmOpen(false);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('settings.signOutFailed'), 'error');
    }
  };

  const openOSSettings = () => {
    Linking.openSettings().catch(() =>
      toast.show(t('settings.openSettingsFailed'), 'error'),
    );
  };

  const locationStatusLabel = (() => {
    if (locStatus === 'granted') return t('settings.statusOn');
    if (locStatus === 'denied') return t('settings.statusOff');
    if (locStatus === 'requesting') return '…';
    return t('settings.statusAsk');
  })();

  const emailFallback = profile?.phone ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/(tabs)/profile')}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          {t('settings.title')}
        </Text>
        <View className="h-9 w-9" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 80 }}
      >
        {/* Profile row */}
        {profile ? (
          <View className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 dark:border-border-dark dark:bg-panel-dark">
            <Avatar name={profile.display_name} uri={profile.avatar_url} size="md" />
            <View className="flex-1">
              <Text
                className="text-base font-semibold text-text-light dark:text-text-dark"
                numberOfLines={1}
              >
                {profile.display_name}
              </Text>
              <Text
                className="text-xs text-muted-light dark:text-muted-dark"
                numberOfLines={1}
              >
                @{profile.username}
                {emailFallback ? ` · ${emailFallback}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/profile-edit')}
              className="rounded-full border border-border-light bg-elevated-light px-3 py-1.5 dark:border-border-dark dark:bg-elevated-dark"
            >
              <Text className="text-xs font-semibold text-text-light dark:text-text-dark">
                {t('settings.edit')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* ACCOUNT */}
        <Section title={t('settings.sectionAccount')}>
          <SettingsRow
            icon="person-outline"
            label={t('settings.personalInfo')}
            onPress={() => router.push('/profile-edit')}
          />
          <SettingsRow
            icon="lock-closed-outline"
            label={t('settings.privacy')}
            hint={t('settings.privacyHint')}
            onPress={() => router.push('/privacy')}
          />
          <SettingsRow
            icon="location-outline"
            label={t('settings.location')}
            hint={
              locStatus === 'granted'
                ? t('settings.locationWhileUsing')
                : locStatus === 'denied'
                  ? t('settings.locationOff')
                  : t('settings.locationAsk')
            }
            rightText={locationStatusLabel}
            onPress={() =>
              locStatus === 'denied' ? openOSSettings() : void requestLocation()
            }
          />
          <SettingsRow
            icon="trash-outline"
            label={t('account.delete')}
            hint={t('account.deleteHint')}
            destructive
            onPress={() => setDeleteOpen(true)}
          />
        </Section>

        {/* PREFERENCES */}
        <Section title={t('settings.sectionPreferences')}>
          <SettingsRow
            icon="notifications-outline"
            label={t('settings.pushNotifications')}
            rightSlot={
              <Switch
                value={pushNotifications}
                onValueChange={setPushNotifications}
                trackColor={{ true: '#0E0E10' }}
              />
            }
          />
          <SettingsRow
            icon="sunny-outline"
            label={t('settings.appearance')}
            rightSlot={
              <View className="flex-row rounded-xl border border-border-light bg-elevated-light p-0.5 dark:border-border-dark dark:bg-elevated-dark">
                {APPEARANCE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => setAppearance(opt)}
                    className={[
                      'rounded-lg px-2.5 py-1',
                      appearance === opt
                        ? 'bg-panel-light dark:bg-panel-dark'
                        : '',
                    ].join(' ')}
                  >
                    <Text
                      className={[
                        'text-[11px] font-semibold',
                        appearance === opt
                          ? 'text-text-light dark:text-text-dark'
                          : 'text-muted-light',
                      ].join(' ')}
                    >
                      {t(APPEARANCE_LABEL[opt])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            }
          />
          <SettingsRow
            icon="globe-outline"
            label={t('settings.language')}
            hint={t('settings.languageHint')}
            rightText={LOCALE_LABEL[locale]}
            onPress={() => setLangOpen(true)}
          />
          <SettingsRow
            icon="pin-outline"
            label={t('settings.searchRadius')}
            hint={t('settings.searchRadiusHint', { km: searchRadiusKm })}
            onPress={() => setRadiusOpen(true)}
          />
          <SettingsRow
            icon="happy-outline"
            label={t('settings.favouriteReaction')}
            hint={t('settings.favouriteReactionHint')}
            rightText={favoriteReaction}
            onPress={() => setReactionOpen(true)}
          />
        </Section>

        {/* MODERATION — only rendered for admins. The screen and every
            RPC behind it re-check is_admin() server-side. */}
        {profile?.is_admin ? (
          <Section title={t('settings.sectionModeration')}>
            <SettingsRow
              icon="shield-checkmark-outline"
              label={t('settings.complaints')}
              hint={t('settings.complaintsHint')}
              onPress={() => router.push('/admin')}
            />
          </Section>
        ) : null}

        {/* SUPPORT */}
        <Section title={t('settings.sectionSupport')}>
          <SettingsRow
            icon="help-circle-outline"
            label={t('settings.helpCenter')}
            onPress={() =>
              Linking.openURL('https://hamuud.github.io/mapmeet/').catch(() =>
                toast.show(t('settings.helpCenterFailed'), 'error'),
              )
            }
          />
          <SettingsRow
            icon="chatbubble-outline"
            label={t('settings.sendFeedback')}
            hint={t('settings.sendFeedbackHint')}
            onPress={() => setFeedbackOpen(true)}
          />
          <SettingsRow
            icon="document-text-outline"
            label={t('settings.legal')}
            onPress={() =>
              Linking.openURL('https://hamuud.github.io/mapmeet/legal/').catch(() =>
                toast.show(t('settings.legalFailed'), 'error'),
              )
            }
          />
        </Section>

        {/* Sign out */}
        <PrimaryButton
          label={t('settings.signOut')}
          variant="destructive-outline"
          onPress={() => setConfirmOpen(true)}
          fullWidth
        />

        <Text className="text-center font-mono text-[11px] text-muted-light">
          MapMeet · v{version}
        </Text>
      </ScrollView>

      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        userId={profile?.id ?? null}
      />

      <ConfirmationDialog
        open={confirmOpen}
        title={t('settings.signOutTitle')}
        message={t('settings.signOutMessage')}
        confirmLabel={t('settings.signOut')}
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Language picker. Each option is written in its own language —
          someone who can't read the current UI still recognises theirs. */}
      <BottomSheet open={langOpen} onClose={() => setLangOpen(false)} autoHeight>
        <View className="gap-1 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {t('settings.language')}
          </Text>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {t('settings.languageHint')}
          </Text>
        </View>
        <View className="mt-3 gap-2">
          {LOCALES.map((code: Locale) => {
            const active = code === locale;
            return (
              <Pressable
                key={code}
                onPress={() => {
                  setLocale(code);
                  setLangOpen(false);
                }}
                accessibilityLabel={LOCALE_LABEL[code]}
                className={[
                  'flex-row items-center justify-between rounded-2xl border px-4 py-3',
                  active
                    ? 'border-text-light bg-elevated-light dark:border-text-dark dark:bg-elevated-dark'
                    : 'border-border-light dark:border-border-dark',
                ].join(' ')}
              >
                <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                  {LOCALE_LABEL[code]}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={18} color={iconColor} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Favourite reaction picker — the palette mirrors the
          toggle_reaction RPC whitelist. */}
      <BottomSheet open={reactionOpen} onClose={() => setReactionOpen(false)} autoHeight>
        <View className="gap-1 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {t('settings.favouriteReaction')}
          </Text>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {t('settings.favouriteReactionSheetHint')}
          </Text>
        </View>
        <View className="mt-3 flex-row justify-between px-1">
          {['❤️', '👍', '😂', '😮', '😢', '🔥'].map((emoji) => {
            const active = emoji === favoriteReaction;
            return (
              <Pressable
                key={emoji}
                onPress={() => {
                  setFavoriteReaction(emoji);
                  setReactionOpen(false);
                }}
                className={[
                  'h-12 w-12 items-center justify-center rounded-full border',
                  active
                    ? 'border-brand-500 bg-brand-500/15'
                    : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
                ].join(' ')}
                accessibilityLabel={t('settings.setAsFavourite', { emoji })}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Radius picker — same BottomSheet component the rest of the
          app uses, so it slides up from the bottom, dims the backdrop,
          and closes on outside tap / swipe-down / value pick. */}
      <BottomSheet open={radiusOpen} onClose={() => setRadiusOpen(false)} autoHeight>
        <View className="gap-1 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {t('settings.searchRadius')}
          </Text>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {t('settings.searchRadiusSheetHint')}
          </Text>
        </View>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {RADII_KM.map((r) => {
            const active = r === searchRadiusKm;
            return (
              <Pressable
                key={r}
                onPress={() => {
                  setSearchRadiusKm(r);
                  setRadiusOpen(false);
                }}
                className={[
                  'rounded-full border px-4 py-2',
                  active
                    ? 'border-text-light bg-text-light dark:border-text-dark dark:bg-text-dark'
                    : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
                ].join(' ')}
              >
                <Text
                  className={[
                    'text-xs font-semibold',
                    active
                      ? 'text-surface-light dark:text-surface-dark'
                      : 'text-text-light dark:text-text-dark',
                  ].join(' ')}
                >
                  {r} {t('common.km')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Building blocks ──────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark">
        {children}
      </View>
    </View>
  );
}

type SettingsRowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  rightText?: string;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  /** Red icon + label, for the one row that destroys something. */
  destructive?: boolean;
};

function SettingsRow({
  icon,
  label,
  hint,
  rightText,
  rightSlot,
  onPress,
  destructive = false,
}: SettingsRowProps) {
  const iconColor = useIconColor();
  const mutedIconColor = useMutedIconColor();
  const content = (
    <View className="flex-row items-center gap-3 border-b border-border-light px-4 py-3 last:border-b-0 dark:border-border-dark">
      <View
        className={[
          'h-9 w-9 items-center justify-center rounded-xl',
          destructive ? 'bg-red-500/10' : 'bg-elevated-light dark:bg-elevated-dark',
        ].join(' ')}
      >
        <Ionicons name={icon} size={16} color={destructive ? '#B91C1C' : iconColor} />
      </View>
      <View className="flex-1">
        <Text
          className={[
            'text-[15px] font-semibold',
            destructive ? 'text-red-700 dark:text-red-400' : 'text-text-light dark:text-text-dark',
          ].join(' ')}
        >
          {label}
        </Text>
        {hint ? (
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {hint}
          </Text>
        ) : null}
      </View>
      {rightSlot ? (
        rightSlot
      ) : rightText ? (
        <Text className="mr-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
          {rightText}
        </Text>
      ) : null}
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={mutedIconColor} />
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
      style={({ pressed }) => (Platform.OS === 'ios' && pressed ? { opacity: 0.7 } : null)}
    >
      {content}
    </Pressable>
  );
}
