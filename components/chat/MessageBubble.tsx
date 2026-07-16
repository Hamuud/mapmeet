import { Image, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { MessageWithSender } from '@/types';

type Props = {
  message: MessageWithSender;
  isOwn: boolean;
  /** Show "Read" under the bubble — only set for the viewer's last own message. */
  showReadReceipt?: boolean;
  onLongPress?: (message: MessageWithSender) => void;
  onPressAvatar?: (userId: string) => void;
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Renders one chat message. System messages are centered captions;
 *  user messages are left/right-aligned bubbles with sender name +
 *  avatar on the incoming side. Image/video/location render as simple
 *  tappable placeholders until the media UI lands. */
export function MessageBubble({
  message,
  isOwn,
  showReadReceipt,
  onLongPress,
  onPressAvatar,
}: Props) {
  if (message.type === 'system') {
    return (
      <View className="my-1.5 items-center px-6">
        <View className="rounded-full bg-accent-400/10 px-3 py-1">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-accent-400">
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  if (message.hidden) {
    return (
      <View className={`my-0.5 px-4 ${isOwn ? 'items-end' : 'items-start'}`}>
        <Text className="text-xs italic text-muted-light dark:text-muted-dark">
          Message removed by the host
        </Text>
      </View>
    );
  }

  const senderName = message.sender?.display_name ?? 'Unknown';

  return (
    <View
      className={`my-0.5 flex-row px-4 ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      {!isOwn ? (
        <Pressable
          onPress={() => message.sender && onPressAvatar?.(message.sender.id)}
          className="mr-2 self-end"
          hitSlop={6}
        >
          <Avatar
            name={senderName}
            uri={message.sender?.avatar_url ?? null}
            size="xs"
          />
        </Pressable>
      ) : null}

      <Pressable
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={350}
        className={[
          'max-w-[78%] rounded-2xl px-3.5 py-2.5',
          isOwn
            ? 'rounded-br-md bg-text-light dark:bg-text-dark'
            : 'rounded-bl-md border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
        ].join(' ')}
      >
        {!isOwn ? (
          <Text className="mb-0.5 text-[11px] font-semibold text-brand-500">
            {senderName}
          </Text>
        ) : null}

        {message.type === 'text' ? (
          <Text
            className={
              isOwn
                ? 'text-[15px] leading-snug text-surface-light dark:text-surface-dark'
                : 'text-[15px] leading-snug text-text-light dark:text-text-dark'
            }
          >
            {message.text}
          </Text>
        ) : message.type === 'image' && message.media_url ? (
          <Image
            source={{ uri: message.media_url }}
            style={{ width: 200, height: 200, borderRadius: 12 }}
            resizeMode="cover"
          />
        ) : message.type === 'location' ? (
          <Text
            className={
              isOwn
                ? 'text-[15px] text-surface-light dark:text-surface-dark'
                : 'text-[15px] text-text-light dark:text-text-dark'
            }
          >
            📍 {message.latitude?.toFixed(5)}, {message.longitude?.toFixed(5)}
          </Text>
        ) : (
          <Text className="text-[15px] italic text-muted-light">
            Unsupported message
          </Text>
        )}

        <Text
          className={[
            'mt-1 self-end font-mono text-[9px] uppercase',
            isOwn
              ? 'text-surface-light/60 dark:text-surface-dark/60'
              : 'text-muted-light',
          ].join(' ')}
        >
          {timeLabel(message.created_at)}
          {showReadReceipt ? ' · read' : ''}
        </Text>
      </Pressable>
    </View>
  );
}
