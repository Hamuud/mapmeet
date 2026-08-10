import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { PollDetails, PollPayload } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  poll: PollPayload | null;
  details: PollDetails | null;
};

/** Modal breakdown of a poll: each option with its tally and — for
 *  non-anonymous polls — the list of people who voted for it. Tapping a
 *  voter opens their profile. */
export function PollResultsSheet({ open, onClose, poll, details }: Props) {
  const t = useT();
  const total = (poll?.options ?? []).reduce((s, o) => s + (o.votes ?? 0), 0);

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8} autoHeight>
      <View className="gap-3 pb-2">
        <View className="gap-0.5">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark" numberOfLines={2}>
            {poll?.question ?? t('poll.results')}
          </Text>
          <Text className="text-xs text-muted-light">
            {total} {total === 1 ? 'vote' : 'votes'}
          </Text>
        </View>

        {poll?.anonymous ? (
          <View className="rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
            <Text className="text-sm text-muted-light">
              {t('poll.anonymousNote')}
            </Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <View className="gap-4">
              {(poll?.options ?? []).map((opt) => {
                const votes = opt.votes ?? 0;
                const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                const voters = details?.voters?.[opt.id] ?? [];
                return (
                  <View key={opt.id} className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="flex-1 pr-2 text-[15px] font-semibold text-text-light dark:text-text-dark"
                        numberOfLines={2}
                      >
                        {opt.text}
                      </Text>
                      <Text className="text-[13px] font-semibold text-muted-light">
                        {votes} · {pct}%
                      </Text>
                    </View>
                    {voters.length > 0 ? (
                      <View className="gap-1.5">
                        {voters.map((v) => (
                          <Pressable
                            key={v.id}
                            onPress={() => {
                              onClose();
                              router.navigate({
                                pathname: '/user/[username]',
                                params: { username: v.username },
                              });
                            }}
                            className="flex-row items-center gap-2.5 active:opacity-70"
                          >
                            <Avatar name={v.display_name} uri={v.avatar_url} size="xs" />
                            <Text
                              className="text-[13px] text-text-light dark:text-text-dark"
                              numberOfLines={1}
                            >
                              {v.display_name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Text className="text-xs text-muted-light">No votes yet</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}
