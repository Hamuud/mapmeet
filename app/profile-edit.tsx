import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { AvatarUpload } from '@/features/profile/AvatarUpload';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { authService } from '@/services/auth.service';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';
import { INTERESTS, MAX_INTERESTS } from '@/utils/interests';

/** Edit-profile screen. Reached from the "You" tab (Edit profile button)
 *  and from Settings (Personal info / Edit chip). Persists to Supabase
 *  via `profilesService.update`, then patches the local auth store so
 *  every other screen sees the update without a refetch. */
export default function ProfileEditScreen() {
  const toast = useToast();
  const { profile, session } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);
  const iconColor = useIconColor();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Phone verification state
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  // Which phone the OTP was sent to — the OTP verify call needs the
  // same number the request was made with, so we snapshot it here in
  // case the user edits the field between "Send code" and "Verify".
  const [otpPhone, setOtpPhone] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setBio(profile.bio ?? '');
    setPhone(profile.phone ?? '');
    setInterests(profile.interests ?? []);
  }, [profile]);

  // Supabase's auth-side phone (auth.users.phone + phone_confirmed_at)
  // is the source of truth for "is this number verified?". Compare
  // against the field value so the badge only shows when the field
  // still matches the verified number.
  const authPhone = (session?.user.phone ?? '').trim();
  const authPhoneConfirmed = !!session?.user.phone_confirmed_at;
  const phoneMatchesAuth =
    authPhone.length > 0 && authPhone === phone.trim();
  const isVerified = authPhoneConfirmed && phoneMatchesAuth;

  if (!profile) {
    // Guard — router will bounce user to auth. Rendering nothing is
    // fine here; the (auth) layout takes over.
    return null;
  }

  const toggleInterest = (key: string) => {
    setInterests((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_INTERESTS) {
        toast.show(`Pick up to ${MAX_INTERESTS} interests.`, 'info');
        return prev;
      }
      return [...prev, key];
    });
  };

  // Very loose format check — enough to catch obvious typos before we
  // spend an SMS on it. Supabase itself does the strict E.164 parse
  // server-side and will error out cleanly if the number's malformed.
  const phoneLooksValid = /^\+[0-9 ().-]{6,}$/.test(phone.trim());

  const handleSendOtp = async () => {
    const trimmed = phone.trim();
    if (!phoneLooksValid) {
      toast.show('Enter the number in E.164 form, e.g. +15551234567.', 'error');
      return;
    }
    setSendingOtp(true);
    try {
      await authService.requestPhoneOtp(trimmed);
      setOtpPhone(trimmed);
      setOtpCode('');
      setOtpOpen(true);
      toast.show(`Code sent to ${trimmed}.`, 'success');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not send verification code',
        'error',
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length < 4) {
      toast.show('Enter the code from the SMS.', 'error');
      return;
    }
    setVerifyingOtp(true);
    try {
      await authService.verifyPhoneOtp(otpPhone, trimmedCode);
      // Mirror the verified number into the profile row so it's queryable
      // via `profiles.phone` and shows in the "You" tab without joining
      // against auth.users.
      const updated = await profilesService.update(profile.id, {
        phone: otpPhone,
      });
      setProfile(updated);
      setOtpOpen(false);
      setOtpCode('');
      toast.show('Phone verified.', 'success');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Verification failed',
        'error',
      );
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      toast.show('Display name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await profilesService.update(profile.id, {
        display_name: trimmedName,
        bio: bio.trim() ? bio.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        interests,
      });
      setProfile(updated);
      toast.show('Profile updated.', 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
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
            Edit profile
          </Text>
          <View className="h-9 w-9" />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View className="items-center">
            <AvatarUpload profile={profile} />
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
          />

          <View>
            <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
              Handle
            </Text>
            <View className="flex-row items-center rounded-xl border border-border-light bg-elevated-light px-4 py-2.5 dark:border-border-dark dark:bg-elevated-dark">
              <Text className="text-[15px] text-muted-light">@{profile.username}</Text>
            </View>
            <Text className="mt-1.5 text-xs text-muted-light dark:text-muted-dark">
              Handles are permanent for now. Contact support to change yours.
            </Text>
          </View>

          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="A short line about you."
            multiline
            maxLength={240}
            helperText={`${bio.length}/240`}
          />

          {/* Phone + verify chip.
              - Unverified: input is editable, Verify chip on the right
                fires the OTP flow. If the user edits the field so it no
                longer matches `auth.users.phone`, they land back here.
              - Verified: input is read-only, a full-width green
                "Verified" pill replaces the Verify chip, and a
                "Change the number" affordance sits below. Tapping the
                affordance shows a toast — number-change lands in a
                follow-up because it needs a re-verify + delete path
                on the auth side. */}
          <View>
            <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
              Phone
            </Text>
            {isVerified ? (
              <>
                <View className="h-11 flex-row items-center rounded-xl border border-border-light bg-elevated-light px-4 dark:border-border-dark dark:bg-elevated-dark">
                  <Text className="text-[15px] text-text-light dark:text-text-dark">
                    {phone}
                  </Text>
                </View>
                <View className="mt-2">
                  <View className="h-11 flex-row items-center justify-center gap-1.5 rounded-xl border border-green-600/40 bg-green-600/10">
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text className="text-sm font-semibold text-green-700">
                      Verified
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() =>
                    toast.show(
                      'Changing the phone number is not available in the current version.',
                      'info',
                    )
                  }
                  className="mt-2 self-start"
                  hitSlop={6}
                >
                  <Text className="text-xs font-semibold text-brand-500 underline">
                    Change the number
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+15551234567"
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                    />
                  </View>
                  <Pressable
                    onPress={handleSendOtp}
                    disabled={!phoneLooksValid || sendingOtp}
                    className={[
                      'h-11 flex-row items-center rounded-xl px-3',
                      !phoneLooksValid || sendingOtp
                        ? 'bg-elevated-light dark:bg-elevated-dark'
                        : 'bg-text-light dark:bg-text-dark',
                    ].join(' ')}
                  >
                    <Text
                      className={[
                        'text-xs font-semibold',
                        !phoneLooksValid || sendingOtp
                          ? 'text-muted-light'
                          : 'text-surface-light dark:text-surface-dark',
                      ].join(' ')}
                    >
                      {sendingOtp ? 'Sending…' : 'Verify'}
                    </Text>
                  </Pressable>
                </View>
                <Text className="mt-1.5 text-xs text-muted-light dark:text-muted-dark">
                  Include country code (e.g. +1 for US, +380 for UA). We
                  text a 6-digit code to confirm the number.
                </Text>
              </>
            )}
          </View>

          {/* Interests */}
          <View>
            <View className="mb-2 flex-row items-baseline justify-between">
              <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
                Interests
              </Text>
              <Text className="text-[11px] text-muted-light">
                {interests.length}/{MAX_INTERESTS}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {INTERESTS.map((i) => {
                const active = interests.includes(i.key);
                return (
                  <Pressable
                    key={i.key}
                    onPress={() => toggleInterest(i.key)}
                    className={[
                      'flex-row items-center gap-1.5 rounded-xl border px-3 py-2',
                      active
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                    ].join(' ')}
                  >
                    <Text style={{ fontSize: 14 }}>{i.emoji}</Text>
                    <Text
                      className={[
                        'text-sm font-semibold',
                        active
                          ? 'text-brand-500'
                          : 'text-text-light dark:text-text-dark',
                      ].join(' ')}
                    >
                      {i.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-2 text-xs text-muted-light dark:text-muted-dark">
              Shown on your profile; also helps us surface events you'd
              enjoy.
            </Text>
          </View>

          <PrimaryButton
            label="Save changes"
            onPress={handleSave}
            loading={saving}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* OTP verification sheet — bottom-docked so the keyboard from
          the code input doesn't cover it. Auto-height keeps it short. */}
      <BottomSheet open={otpOpen} onClose={() => setOtpOpen(false)} autoHeight>
        <View className="gap-3 pb-2">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Verify phone
          </Text>
          <Text className="text-sm text-muted-light dark:text-muted-dark">
            We sent a 6-digit code to {otpPhone}. Enter it below to link
            this number to your account.
          </Text>
          <Input
            value={otpCode}
            onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, ''))}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <PrimaryButton
                label="Resend"
                variant="secondary"
                onPress={handleSendOtp}
                loading={sendingOtp}
                fullWidth
              />
            </View>
            <View className="flex-1">
              <PrimaryButton
                label="Verify"
                onPress={handleVerifyOtp}
                loading={verifyingOtp}
                fullWidth
              />
            </View>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
