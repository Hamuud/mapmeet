import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { groupsService } from '@/services/groups.service';
import { goBack } from '@/utils/nav';

type Preview = Awaited<ReturnType<typeof groupsService.previewInvite>>;

/** Accept-invite landing for a group chat. Reached from a shared
 *  /group-invite/<token> link. Anyone with a live token can join —
 *  the friends-only rule is for the in-app "add member" flow, this
 *  link is the deliberately-broader Telegram-style share. */
export default function GroupInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const toast = useToast();

  const [preview, setPreview] = useState<Preview>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    groupsService
      .previewInvite(token)
      .then((row) => {
        if (!cancelled) setPreview(row);
      })
      .catch((e) => {
        if (!cancelled) toast.show(e instanceof Error ? e.message : 'Could not load invite', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const handleAccept = async () => {
    if (!token) return;
    if (!session) {
      toast.show('Sign in to join the group.', 'info');
      router.replace('/(auth)/login');
      return;
    }
    setBusy(true);
    try {
      const groupId = await groupsService.acceptInvite(token);
      toast.show("You're in — opening the group.", 'success');
      router.replace({ pathname: '/group/[id]', params: { id: groupId } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not join', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <Text className="text-sm text-muted-light">Loading invite…</Text>
      </SafeAreaView>
    );
  }

  if (!preview) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="💬"
          title="Invite not found"
          description="This link may have been mistyped or the invite was cancelled."
          actionLabel="Open map"
          onAction={() => router.replace('/(tabs)/map')}
        />
      </SafeAreaView>
    );
  }

  if (preview.expired) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="⏰"
          title="This invite has expired"
          description="Group invites are valid for 24 hours. Ask someone in the group for a fresh link."
          actionLabel="Open map"
          onAction={() => router.replace('/(tabs)/map')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/(tabs)/chat')}
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color="#4B5FE0" />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          Group invite
        </Text>
        <View className="h-9 w-9" />
      </View>

      <View className="items-center gap-4 p-6">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-elevated-light dark:bg-elevated-dark">
          <Text style={{ fontSize: 40 }}>{preview.group_emoji}</Text>
        </View>
        <View className="items-center gap-1">
          <Text className="text-center text-2xl font-bold text-text-light dark:text-text-dark">
            {preview.group_name}
          </Text>
          <Text className="text-sm text-muted-light dark:text-muted-dark">
            {preview.member_count}{' '}
            {preview.member_count === 1 ? 'member' : 'members'} · invited by @
            {preview.inviter_username}
          </Text>
        </View>

        <View className="mt-2 w-full">
          <PrimaryButton
            label={session ? 'Join group' : 'Sign in to join'}
            loading={busy}
            onPress={handleAccept}
            fullWidth
          />
        </View>
        <Text className="text-center text-[11px] text-muted-light">
          This invite link is valid for 24 hours from creation.
        </Text>
      </View>
    </SafeAreaView>
  );
}
