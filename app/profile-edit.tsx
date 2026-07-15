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

import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { AvatarUpload } from '@/features/profile/AvatarUpload';
import { useAuth } from '@/hooks/useAuth';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';
import { INTERESTS, MAX_INTERESTS } from '@/utils/interests';

/** Edit-profile screen. Reached from the "You" tab (Edit profile button)
 *  and from Settings (Personal info / Edit chip). Persists to Supabase
 *  via `profilesService.update`, then patches the local auth store so
 *  every other screen sees the update without a refetch. */
export default function ProfileEditScreen() {
  const toast = useToast();
  const { profile } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setBio(profile.bio ?? '');
    setPhone(profile.phone ?? '');
    setInterests(profile.interests ?? []);
  }, [profile]);

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
            <Ionicons name="chevron-back" size={18} color="#0E0E10" />
          </Pressable>
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Edit profile
          </Text>
          <View className="h-9 w-9" />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
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

          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 123 4567"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

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
    </SafeAreaView>
  );
}
