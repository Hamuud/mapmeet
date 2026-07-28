import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';

import { useModerationStore } from '@/store/moderation.store';

function formatUntil(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Shown when a muted or banned account tries to post, join, or otherwise
 *  act. Mounted once in the tabs layout; the moderation store opens it. */
export function RestrictionDialog() {
  const open = useModerationStore((s) => s.blockedOpen);
  const hide = useModerationStore((s) => s.hideBlocked);
  const banned = useModerationStore((s) => s.banned);
  const mutedUntil = useModerationStore((s) => s.mutedUntil);

  const stillMuted = !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={hide}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-[400px] gap-3 rounded-3xl bg-panel-light p-6 dark:bg-panel-dark">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10">
            <Ionicons
              name={banned ? 'ban' : 'time-outline'}
              size={24}
              color="#B91C1C"
            />
          </View>

          <Text className="text-xl font-bold text-text-light dark:text-text-dark">
            {banned ? 'Account blocked' : 'Action temporarily blocked'}
          </Text>

          <Text className="text-[15px] leading-snug text-ink2-light dark:text-ink2-dark">
            {banned
              ? 'This action is unavailable because your account has been blocked following multiple complaints. Contact support if you think this is a mistake.'
              : 'This action is temporarily unavailable because of multiple complaints about your account.'}
          </Text>

          {!banned && stillMuted && mutedUntil ? (
            <View className="gap-0.5 rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
              <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
                Available again
              </Text>
              <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                {formatUntil(mutedUntil)}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={hide}
            className="mt-1 items-center rounded-2xl bg-text-light py-3.5 active:opacity-90 dark:bg-text-dark"
          >
            <Text className="text-[15px] font-semibold text-surface-light dark:text-surface-dark">
              Got it
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
