import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { UserReview } from '@/services/ratings.service';
import { formatRelativeTime } from '@/utils/format';

/** One anonymous review. Author is never shown — the list RPC omits it —
 *  so this renders "Anonymous" for every review, including the ones a
 *  user reads about themselves. */
export function ReviewCard({ review }: { review: UserReview }) {
  return (
    <View className="gap-1.5 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="person-circle-outline" size={14} color="#8B8880" />
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            Anonymous
          </Text>
        </View>
        <Text className="font-mono text-[9px] uppercase text-muted-light">
          {formatRelativeTime(review.created_at)}
        </Text>
      </View>
      <Text className="text-[14px] leading-snug text-text-light dark:text-text-dark">
        {review.text}
      </Text>
    </View>
  );
}
