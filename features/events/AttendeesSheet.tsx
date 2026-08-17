import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { useT } from '@/i18n';
import type { EventAttendee } from '@/types';

type Props = {
  open: boolean;
  attendees: EventAttendee[];
  /** From the event, not from `attendees.length` — the list is filtered
   *  by each person's own visibility setting and the count is not. */
  total: number;
  /** True when the list couldn't be fetched. Without this an empty list
   *  and a failed request look identical, and the sheet would tell the
   *  user that everyone had chosen to be unlisted. */
  failed?: boolean;
  viewerId: string | null;
  onClose: () => void;
  onViewProfile: (attendee: EventAttendee) => void;
};

/** The full list of people going.
 *
 *  Reachable from the event sheet before joining, which is the whole
 *  point — until now this list only existed inside the members-only chat,
 *  so you could see who was coming only after committing to come.
 *
 *  Friends come first (the RPC orders them), and every row opens a
 *  profile, because "who is that" is the immediate next question. */
export function AttendeesSheet({
  open,
  attendees,
  total,
  failed = false,
  viewerId,
  onClose,
  onViewProfile,
}: Props) {
  const t = useT();
  const hidden = failed ? 0 : Math.max(0, total - attendees.length);

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8} autoHeight>
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-2xl text-text-light dark:text-text-dark">
            {t('attendees.title', { count: total })}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel={t('common.close')}
            className="h-8 w-8 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
          >
            <Ionicons name="close" size={16} color="#8B8880" />
          </Pressable>
        </View>

        <FlatList
          data={attendees}
          keyExtractor={(a) => a.id}
          style={{ maxHeight: 380 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 2 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onViewProfile(item)}
              className="flex-row items-center gap-3 rounded-2xl px-1 py-2 active:opacity-70"
            >
              <Avatar
                name={item.display_name}
                uri={item.avatar_url}
                size="sm"
              />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className="shrink text-[15px] font-semibold text-text-light dark:text-text-dark"
                    numberOfLines={1}
                  >
                    {item.id === viewerId ? t('common.you') : item.display_name}
                  </Text>
                  <VerifiedBadge role={item.role} size={14} />
                  {item.is_friend ? (
                    <View className="rounded-full bg-brand-500/10 px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-brand-500">
                        {t('attendees.friend')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  className="text-xs text-muted-light dark:text-muted-dark"
                  numberOfLines={1}
                >
                  @{item.username}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#8B8880" />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text className="py-4 text-sm text-muted-light dark:text-muted-dark">
              {failed ? t('attendees.failed') : t('attendees.none')}
            </Text>
          }
        />

        {/* Somebody chose not to be listed. Say so rather than letting the
            numbers quietly disagree — "12 going" over eight faces looks
            like a bug until you know it isn't. */}
        {hidden > 0 ? (
          <Text className="border-t border-border-light pt-2.5 text-xs text-muted-light dark:border-border-dark dark:text-muted-dark">
            {t('attendees.hidden', { count: hidden })}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
