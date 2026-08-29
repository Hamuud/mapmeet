import { useMemo, useRef } from 'react';
import { Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { MessageWithSender } from '@/types';

/** A rule across the thread marking where you stopped reading. */
export function UnreadDivider({ count }: { count: number }) {
  const t = useT();
  return (
    <View className="my-2 flex-row items-center gap-3 px-4">
      <View className="h-px flex-1 bg-accent-400/40" />
      <Text className="font-mono text-[9px] uppercase tracking-wider text-accent-500">
        {t('room.unreadDivider', { count })}
      </Text>
      <View className="h-px flex-1 bg-accent-400/40" />
    </View>
  );
}

/** Which message the divider sits above, frozen at the moment the room
 *  opened.
 *
 *  Frozen is the whole point. Opening a room marks it read, so a live
 *  computation would find the boundary, render it, and then watch it
 *  vanish half a second later as the read receipt landed — the one
 *  moment you actually wanted to see it. Latching the id on first sight
 *  keeps it on screen until you leave, which is how long it is useful.
 *
 *  Returns null when everything was already read, or when the unread run
 *  starts at the very top of the loaded window — a divider above the
 *  first visible message tells you nothing you cannot see.
 */
export function useUnreadBoundary(
  /** Oldest-first, as stored. */
  messages: MessageWithSender[],
  viewerId: string | null,
): { firstUnreadId: string | null; unreadCount: number } {
  const latched = useRef<{ id: string | null; count: number } | null>(null);

  return useMemo(() => {
    if (latched.current) return {
      firstUnreadId: latched.current.id,
      unreadCount: latched.current.count,
    };
    if (!viewerId || messages.length === 0) {
      return { firstUnreadId: null, unreadCount: 0 };
    }

    const unread = messages.filter(
      (m) => m.sender_id !== viewerId && !(m.read_by ?? []).includes(viewerId),
    );
    // Wait for the first render that actually has messages before
    // latching, or an empty first pass would freeze "nothing unread"
    // for the life of the screen.
    const first = unread[0] ?? null;
    const atTop = !!first && messages[0]?.id === first.id;
    const result = {
      id: first && !atTop ? first.id : null,
      count: unread.length,
    };
    latched.current = result;
    return { firstUnreadId: result.id, unreadCount: result.count };
  }, [messages, viewerId]);
}
