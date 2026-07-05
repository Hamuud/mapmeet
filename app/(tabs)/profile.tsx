import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { AvatarUpload } from '@/features/profile/AvatarUpload';
import { useAuth } from '@/hooks/useAuth';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';
import { useEventsStore } from '@/store/events.store';

export default function ProfileScreen() {
  const toast = useToast();
  const { profile, signOut } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);
  const events = useEventsStore((s) => s.events);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const { createdCount, joinedCount } = useMemo(() => {
    if (!profile) return { createdCount: 0, joinedCount: 0 };
    return {
      createdCount: events.filter((e) => e.creator_id === profile.id).length,
      joinedCount: events.filter((e) => e.is_joined).length,
    };
  }, [events, profile]);

  const handleSaveName = async () => {
    if (!profile || !draftName.trim() || draftName === profile.display_name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await profilesService.update(profile.id, {
        display_name: draftName.trim(),
      });
      setProfile(updated);
      setEditing(false);
      toast.show('Profile updated.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setConfirmOpen(false);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not sign out', 'error');
    }
  };

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="👤"
          title="No profile yet"
          description="Your profile will appear here once you sign in."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text className="text-3xl font-bold text-text-light dark:text-text-dark">
          Profile
        </Text>

        <View className="items-center gap-4 rounded-3xl border border-border-light bg-elevated-light p-6 dark:border-border-dark dark:bg-elevated-dark">
          <AvatarUpload profile={profile} />

          {editing ? (
            <View className="w-full gap-3">
              <Input
                label="Display name"
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setDraftName(profile.display_name);
                      setEditing(false);
                    }}
                    fullWidth
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Save"
                    onPress={handleSaveName}
                    loading={saving}
                    fullWidth
                  />
                </View>
              </View>
            </View>
          ) : (
            <View className="items-center">
              <Text className="text-xl font-semibold text-text-light dark:text-text-dark">
                {profile.display_name}
              </Text>
              <Text className="text-sm text-muted-light dark:text-muted-dark">
                @{profile.username}
              </Text>
            </View>
          )}

          <View className="mt-2 w-full flex-row justify-around">
            <Stat label="Created" value={createdCount} />
            <View className="w-px bg-border-light dark:bg-border-dark" />
            <Stat label="Joined" value={joinedCount} />
          </View>
        </View>

        <View className="gap-3">
          {!editing ? (
            <PrimaryButton
              label="Edit display name"
              variant="secondary"
              fullWidth
              onPress={() => {
                setDraftName(profile.display_name);
                setEditing(true);
              }}
            />
          ) : null}
          <PrimaryButton
            label="Sign out"
            variant="destructive"
            fullWidth
            onPress={() => setConfirmOpen(true)}
          />
        </View>
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
    </SafeAreaView>
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
