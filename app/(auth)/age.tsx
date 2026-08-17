import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/ui/DateTimeField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { authService } from '@/services/auth.service';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';
import { ageFrom, MIN_SIGNUP_AGE } from '@/utils/validators';

/** One-time "how old are you" screen.
 *
 *  Every account passes through here once, which is deliberate: signup
 *  returns no session when email confirmation is on, Google never asks
 *  for a birthday at all, and accounts created before this existed have
 *  never been asked. One screen covers all three instead of three
 *  half-paths.
 *
 *  Someone who just typed their date of birth on the signup form does not
 *  see it — the date rides along in the session's metadata and this
 *  submits it on their behalf. The submit is the point: `set_date_of_birth`
 *  is where the age floor is actually enforced, so the answer has to reach
 *  it whichever door the account came through.
 *
 *  There is no skip. Every other gate in this app can be dismissed; this
 *  one decides whether we are arranging meetings for children. */
export default function AgeScreen() {
  const t = useT();
  const toast = useToast();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  const submit = async (value: string) => {
    const age = ageFrom(value);
    if (age === null) {
      setError(t('age.invalid'));
      return false;
    }
    if (age < MIN_SIGNUP_AGE) {
      setError(t('age.tooYoung', { n: MIN_SIGNUP_AGE }));
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      // Ask the auth client for a *live* session rather than trusting the
      // copy in the store. This screen can sit open for a long time — it
      // is the first thing a returning user sees — and if the access
      // token lapsed while it was open, the RPC would go out with the
      // anon key and come back with the database's own "not signed in",
      // which is both alarming and a dead end. One refresh attempt, then
      // an honest way out.
      const live = await authService.getSession();
      if (!live) {
        setError(t('age.sessionLost'));
        setBusy(false);
        router.replace('/(auth)/login');
        return false;
      }

      await profilesService.setDateOfBirth(value);
      // The gate keys off profiles.age_confirmed, which the function just
      // flipped. Refetch rather than patching locally — the function is
      // the authority on what landed, and the redirect won't let go until
      // the store agrees.
      const id = profile?.id ?? live.user.id;
      const fresh = await profilesService.getById(id);
      if (fresh) setProfile(fresh);

      // And then actually leave. Without this the answer saves, the gate
      // opens, and the user is left staring at the same screen with no
      // sign anything happened — which reads as "it didn't work", so they
      // press it again. (welcome.tsx has always done this; this screen
      // was missing it.)
      router.replace('/(tabs)/map');
      return true;
    } catch (e) {
      // The function's message is written for a person; show it.
      setError(e instanceof Error ? e.message : t('age.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // If they answered on the signup form, don't ask twice.
  useEffect(() => {
    if (autoTried.current || !session) return;
    autoTried.current = true;
    const carried = session.user.user_metadata?.date_of_birth;
    if (typeof carried !== 'string' || ageFrom(carried) === null) return;
    void submit(carried);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 24, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3 pt-6">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
              <Ionicons name="calendar-outline" size={22} color="#4B5FE0" />
            </View>
            <Text className="font-display text-4xl leading-tight text-text-light dark:text-text-dark">
              {t('age.title')}
            </Text>
            <Text className="text-[15px] leading-relaxed text-muted-light dark:text-muted-dark">
              {t('age.why', { n: MIN_SIGNUP_AGE })}
            </Text>
          </View>

          <View className="gap-2">
            <DateTimeField
              mode="date"
              label={t('age.label')}
              value={dob}
              onChange={(v) => {
                setDob(v);
                setError(null);
              }}
              error={error ?? undefined}
            />
            {error ? (
              <Text className="text-xs font-medium text-red-500">{error}</Text>
            ) : null}
          </View>

          <View className="gap-3">
            <PrimaryButton
              label={t('age.submit')}
              loading={busy}
              onPress={() => void submit(dob)}
              fullWidth
            />
            {/* No skip. The way out, for someone unwilling to say, is to
                stop using the app — so the sign-out is here rather than
                three screens deep behind a gate they cannot pass. */}
            <PrimaryButton
              label={t('age.signOut')}
              variant="secondary"
              onPress={() => {
                void authService.signOut().catch(() => {
                  toast.show(t('settings.signOutFailed'), 'error');
                });
              }}
              fullWidth
            />
          </View>

          <Text className="text-xs leading-relaxed text-muted-light dark:text-muted-dark">
            {t('age.privacy')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
