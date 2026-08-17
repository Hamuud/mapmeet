import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { dmsService } from '@/services/dms.service';
import { friendshipsService } from '@/services/friendships.service';
import { calendarLocation, calendarTitle } from '@/utils/ics';
import { formatEventDate, formatEventTime } from '@/utils/format';
import type { EventWithCreator, ProfileRef } from '@/types';

type Props = {
  open: boolean;
  event: EventWithCreator | null;
  viewerId: string | null;
  onClose: () => void;
};

/** Tell someone where you're going, and when you expect to be back.
 *
 *  Not a tracking feature and not an emergency button — it is the thing
 *  people already do by hand before meeting someone from the internet,
 *  made one tap instead of a copy-paste. That reassurance is a large part
 *  of why anyone agrees to go at all, so it belongs in the app rather
 *  than in a separate message the app knows nothing about.
 *
 *  It sends an ordinary direct message. Deliberately: the recipient does
 *  not need a new screen, a notification category, or an explanation —
 *  they need the venue, the time, and when to start wondering. */
export function TellFriendSheet({ open, event, viewerId, onClose }: Props) {
  const t = useT();
  const toast = useToast();
  const [friends, setFriends] = useState<ProfileRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [backBy, setBackBy] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !viewerId) return;
    setLoading(true);
    setPicked(null);
    friendshipsService
      .listFriends(viewerId)
      .then((rows) => setFriends(rows.map((r) => r.other)))
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [open, viewerId]);

  // Default the return time to a couple of hours after it starts — the
  // same assumption the calendar entry makes.
  useEffect(() => {
    if (!open || !event) return;
    const [h, m] = event.event_time.split(':').map(Number);
    const d = new Date();
    d.setHours((h ?? 20) + 2, m ?? 0);
    setBackBy(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    );
  }, [open, event]);

  const send = async () => {
    if (!event || !picked) return;
    setSending(true);
    try {
      await dmsService.sendText(
        picked,
        t('tellFriend.message', {
          title: calendarTitle(event),
          date: formatEventDate(event.event_date),
          time: formatEventTime(event.event_time),
          place: calendarLocation(event),
          back: backBy,
        }),
      );
      toast.show(t('tellFriend.sent'), 'success');
      onClose();
    } catch {
      toast.show(t('tellFriend.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8} autoHeight>
      <View className="gap-4">
        <View className="gap-1">
          <Text className="font-display text-2xl text-text-light dark:text-text-dark">
            {t('tellFriend.title')}
          </Text>
          <Text className="text-sm text-muted-light dark:text-muted-dark">
            {t('tellFriend.subtitle')}
          </Text>
        </View>

        <FlatList
          data={friends}
          keyExtractor={(f) => f.id}
          style={{ maxHeight: 240 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 2 }}
          renderItem={({ item }) => {
            const active = picked === item.id;
            return (
              <Pressable
                onPress={() => setPicked(active ? null : item.id)}
                className={[
                  'flex-row items-center gap-3 rounded-2xl px-2 py-2',
                  active ? 'bg-brand-500/10' : '',
                ].join(' ')}
              >
                <Avatar name={item.display_name} uri={item.avatar_url} size="sm" />
                <Text
                  className="flex-1 text-[15px] font-semibold text-text-light dark:text-text-dark"
                  numberOfLines={1}
                >
                  {item.display_name}
                </Text>
                <Ionicons
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  size={19}
                  color={active ? '#4B5FE0' : '#8B8880'}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text className="py-3 text-sm text-muted-light dark:text-muted-dark">
              {loading ? t('common.loading') : t('tellFriend.noFriends')}
            </Text>
          }
        />

        <DateTimeField
          mode="time"
          label={t('tellFriend.backBy')}
          value={backBy}
          onChange={setBackBy}
        />

        <PrimaryButton
          label={t('tellFriend.send')}
          disabled={!picked}
          loading={sending}
          onPress={() => void send()}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
