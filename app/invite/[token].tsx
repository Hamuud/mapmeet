import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { EmptyState } from '@/components/ui/EmptyState';
import { PosterImage } from '@/components/ui/PosterImage';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { invitesService, type InvitePreview } from '@/services/invites.service';
import { goBack } from '@/utils/nav';
import { formatEventDate, formatEventTime } from '@/utils/format';

/** Accept-invite landing page. Reached from a shared /invite/<token>
 *  link. Loads the event preview via the token, and offers a Join
 *  button; on success, routes into the event's chat. */
export default function InviteAcceptScreen() {
  const t = useT();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const toast = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    invitesService
      .preview(token)
      .then((row) => {
        if (!cancelled) setPreview(row);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.show(e instanceof Error ? e.message : t('invite.loadFailed'), 'error');
        }
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
      // Route through sign-in first — after auth the user can revisit
      // this URL. Deep-link preservation is a follow-up; for now punt
      // to the login screen.
      toast.show(t('invite.signInToAccept'), 'info');
      router.replace('/(auth)/login');
      return;
    }
    setBusy(true);
    try {
      const eventId = await invitesService.accept(token);
      toast.show("You're in — opening the chat.", 'success');
      router.replace({ pathname: '/chat/[id]', params: { id: eventId } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('invite.acceptFailed'), 'error');
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
          emoji="🎟️"
          title={t('invite.notFound')}
          description={t('invite.notFoundHint')}
          actionLabel={t('events.openMap')}
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
          title={t('invite.expired')}
          description={t('invite.expiredEventHint')}
          actionLabel={t('events.openMap')}
          onAction={() => router.replace('/(tabs)/map')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-border-light px-5 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/(tabs)/map')}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color="#4B5FE0" />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          {t('invite.youreInvited')}
        </Text>
        <View className="h-9 w-9" />
      </View>

      <View className="gap-4 p-5">
        {preview.event_image_url ? (
          <PosterImage
            uri={preview.event_image_url}
            height={180}
            accessibilityLabel={t('preview.posterAlt', { title: preview.event_title })}
          />
        ) : null}

        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-elevated-light dark:bg-elevated-dark">
            <Text style={{ fontSize: 26 }}>{preview.event_emoji}</Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-lg font-bold text-text-light dark:text-text-dark"
              numberOfLines={2}
            >
              {preview.event_title}
            </Text>
            <Text
              className="text-xs text-muted-light dark:text-muted-dark"
              numberOfLines={1}
            >
              @{preview.inviter_username} invited you
            </Text>
          </View>
        </View>

        <View className="gap-1.5 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="calendar-outline" size={14} color="#4B5FE0" />
            <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
              {formatEventDate(preview.event_date)} ·{' '}
              {formatEventTime(preview.event_time)}
            </Text>
          </View>
          {preview.event_address ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="location-outline" size={14} color="#4B5FE0" />
              <Text
                className="flex-1 text-sm text-text-light dark:text-text-dark"
                numberOfLines={2}
              >
                {preview.event_address}
              </Text>
            </View>
          ) : null}
        </View>

        <PrimaryButton
          label={session ? t('invite.joinEvent') : t('invite.signInToJoin')}
          loading={busy}
          onPress={handleAccept}
          fullWidth
        />

        <Text className="text-center text-[11px] text-muted-light">
          {t('invite.footerEvent')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
