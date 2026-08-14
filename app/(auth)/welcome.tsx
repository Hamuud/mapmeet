import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { authService } from '@/services/auth.service';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

/** One-time finish-your-signup screen for accounts created through
 *  Google.
 *
 *  OAuth gives us a name and an avatar but never a handle, so the
 *  trigger invents one (`adriana.kovalenko`, or `user_1a2b3c4d` when the
 *  email yields nothing Latin). That handle is public — it is the
 *  profile URL — so the first thing a new account gets asked is whether
 *  to keep it. Skipping is allowed: the generated one is valid, and a
 *  wall between someone and the map is worse than an ugly URL. */
export default function WelcomeScreen() {
  const t = useT();
  const toast = useToast();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  // Seed once from whatever the trigger derived, then leave the fields
  // alone — re-seeding on every profile refresh would overwrite typing.
  useEffect(() => {
    if (seeded.current || !profile) return;
    seeded.current = true;
    setUsername(profile.username);
    setDisplayName(profile.display_name);
  }, [profile]);

  const trimmed = username.trim();
  const wellFormed = USERNAME_RE.test(trimmed);
  const unchanged = trimmed.toLowerCase() === profile?.username.toLowerCase();

  // Debounced availability check, so the answer arrives before the
  // submit rather than as a failure after it.
  useEffect(() => {
    if (!wellFormed || unchanged) {
      setTaken(false);
      return;
    }
    setChecking(true);
    const id = setTimeout(async () => {
      const free = await authService.isUsernameAvailable(trimmed);
      setTaken(!free);
      setChecking(false);
    }, 350);
    return () => {
      clearTimeout(id);
      setChecking(false);
    };
  }, [trimmed, wellFormed, unchanged]);

  const finish = async (keepGenerated: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await authService.completeOnboarding(
        keepGenerated ? (profile?.username ?? trimmed) : trimmed,
        (keepGenerated ? profile?.display_name : displayName.trim()) ||
          profile?.display_name ||
          'MapMeet',
      );
      // Refetch rather than patching locally: the RPC is the authority
      // on what actually landed.
      if (profile) {
        const fresh = await profilesService.getById(profile.id);
        if (fresh) setProfile(fresh);
      }
      router.replace('/(tabs)/map');
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      toast.show(
        raw.includes('USERNAME_TAKEN')
          ? t('welcome.taken')
          : raw.includes('USERNAME_INVALID')
            ? t('welcome.invalid')
            : raw.includes('DISPLAY_NAME_INVALID')
              ? t('welcome.nameInvalid')
              : t('common.somethingWrong'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const error = !trimmed
    ? undefined
    : !wellFormed
      ? t('welcome.invalid')
      : taken
        ? t('welcome.taken')
        : undefined;

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3 pt-6">
            <Avatar
              name={profile?.display_name ?? ''}
              uri={profile?.avatar_url ?? null}
              size="lg"
            />
            <Text className="font-display text-4xl leading-tight text-text-light dark:text-text-dark">
              {t('welcome.title')}
            </Text>
            <Text className="text-center text-sm leading-snug text-muted-light dark:text-muted-dark">
              {t('welcome.subtitle')}
            </Text>
          </View>

          <Input
            label={t('auth.displayName')}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
            autoCapitalize="words"
          />

          <Input
            label={t('auth.username')}
            value={username}
            onChangeText={(v) => setUsername(v.replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            error={error}
            helperText={
              checking
                ? t('welcome.checking')
                : wellFormed && !taken
                  ? t('welcome.available', { username: trimmed })
                  : t('welcome.usernameHint')
            }
            leftAdornment={
              <Text className="text-[15px] text-muted-light">@</Text>
            }
            rightAdornment={
              wellFormed && !taken && !checking ? (
                <Ionicons name="checkmark-circle" size={16} color="#0E9384" />
              ) : null
            }
          />

          <View className="flex-1" />

          <View className="gap-2">
            <PrimaryButton
              label={t('welcome.continue')}
              onPress={() => void finish(false)}
              loading={busy}
              disabled={!wellFormed || taken || checking || !displayName.trim()}
              fullWidth
              size="lg"
            />
            <PrimaryButton
              label={t('welcome.skip')}
              variant="ghost"
              onPress={() => void finish(true)}
              disabled={busy}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
