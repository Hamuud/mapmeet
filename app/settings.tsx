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
import { useAuth } from '@/hooks/useAuth';
import { useIconColor, useMutedIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { usePreferencesStore, type Appearance } from '@/store/preferences.store';

const APPEARANCE_OPTIONS: readonly Appearance[] = ['light', 'dark', 'auto'] as const;
const RADII_KM = [1, 3, 5, 10, 25, 50] as const;

/** MapMeet Settings screen. Reachable from the "You" tab. Groups:
 *  Account (profile + privacy + location), Preferences (notifications,
 *  appearance, language, search radius), and Support (help/feedback/
 *  legal). Sign-out at the bottom, version footer. */
export default function SettingsScreen() {
  const toast = useToast();
  const iconColor = useIconColor();
  const { profile, signOut } = useAuth();
  const { status: locStatus, request: requestLocation } = useLocation();

  const pushNotifications = usePreferencesStore((s) => s.pushNotifications);
  const setPushNotifications = usePreferencesStore((s) => s.setPushNotifications);
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);
  const language = usePreferencesStore((s) => s.language);
  const searchRadiusKm = usePreferencesStore((s) => s.searchRadiusKm);
  const setSearchRadiusKm = usePreferencesStore((s) => s.setSearchRadiusKm);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);

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
      toast.show(e instanceof Error ? e.message : 'Could not sign out', 'error');
    }
  };

  const openOSSettings = () => {
    Linking.openSettings().catch(() =>
      toast.show('Could not open Settings.', 'error'),
    );
  };

  const locationStatusLabel = (() => {
    if (locStatus === 'granted') return 'ON';
    if (locStatus === 'denied') return 'OFF';
    if (locStatus === 'requesting') return '…';
    return 'ASK';
  })();

  const emailFallback = profile?.phone ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          Settings
        </Text>
        <View className="h-9 w-9" />
      </View>

      <ScrollView
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
                Edit
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* ACCOUNT */}
        <Section title="Account">
          <SettingsRow
            icon="person-outline"
            label="Personal info"
            onPress={() => router.push('/profile-edit')}
          />
          <SettingsRow
            icon="lock-closed-outline"
            label="Privacy"
            hint="Who can see your events"
            onPress={() =>
              toast.show('Per-event privacy already lives in each pin.', 'info')
            }
          />
          <SettingsRow
            icon="location-outline"
            label="Location"
            hint={
              locStatus === 'granted'
                ? 'While using the app'
                : locStatus === 'denied'
                  ? 'Turned off — open Settings to enable'
                  : 'Tap to request'
            }
            rightText={locationStatusLabel}
            onPress={() =>
              locStatus === 'denied' ? openOSSettings() : void requestLocation()
            }
          />
        </Section>

        {/* PREFERENCES */}
        <Section title="Preferences">
          <SettingsRow
            icon="notifications-outline"
            label="Push notifications"
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
            label="Appearance"
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
                        'text-[11px] font-semibold capitalize',
                        appearance === opt
                          ? 'text-text-light dark:text-text-dark'
                          : 'text-muted-light',
                      ].join(' ')}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            }
          />
          <SettingsRow
            icon="globe-outline"
            label="Language"
            rightText={language}
            onPress={() => setLangOpen(true)}
          />
          <SettingsRow
            icon="pin-outline"
            label="Search radius"
            hint={`Events shown within ${searchRadiusKm} km`}
            onPress={() => setRadiusOpen(true)}
          />
        </Section>

        {/* SUPPORT */}
        <Section title="Support">
          <SettingsRow
            icon="help-circle-outline"
            label="Help center"
            onPress={() =>
              Linking.openURL('https://hamuud.github.io/mapmeet/').catch(() =>
                toast.show('Could not open help center.', 'error'),
              )
            }
          />
          <SettingsRow
            icon="chatbubble-outline"
            label="Send feedback"
            onPress={() =>
              Linking.openURL(
                'mailto:hello@mapmeet.app?subject=MapMeet%20feedback',
              ).catch(() => toast.show('No mail client set up.', 'error'))
            }
          />
          <SettingsRow
            icon="document-text-outline"
            label="Terms & privacy"
            onPress={() =>
              toast.show('Docs land alongside the public launch.', 'info')
            }
          />
        </Section>

        {/* Sign out */}
        <PrimaryButton
          label="Sign out"
          variant="destructive-outline"
          onPress={() => setConfirmOpen(true)}
          fullWidth
        />

        <Text className="text-center font-mono text-[11px] text-muted-light">
          MapMeet · v{version}
        </Text>
      </ScrollView>

      <ConfirmationDialog
        open={confirmOpen}
        title="Sign out?"
        message="You'll need to sign back in to see your events."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Language picker */}
      <ConfirmationDialog
        open={langOpen}
        title="Language"
        message="Full localization arrives in v0.2. English is the only shipped option today."
        confirmLabel="OK"
        onConfirm={() => setLangOpen(false)}
        onCancel={() => setLangOpen(false)}
      />

      {/* Radius picker — same BottomSheet component the rest of the
          app uses, so it slides up from the bottom, dims the backdrop,
          and closes on outside tap / swipe-down / value pick. */}
      <BottomSheet open={radiusOpen} onClose={() => setRadiusOpen(false)} autoHeight>
        <View className="gap-1 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Search radius
          </Text>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            Used by the Nearby filter to show events around you.
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
                  {r} km
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
};

function SettingsRow({
  icon,
  label,
  hint,
  rightText,
  rightSlot,
  onPress,
}: SettingsRowProps) {
  const iconColor = useIconColor();
  const mutedIconColor = useMutedIconColor();
  const content = (
    <View className="flex-row items-center gap-3 border-b border-border-light px-4 py-3 last:border-b-0 dark:border-border-dark">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark">
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
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
