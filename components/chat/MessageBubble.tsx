import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { AudioBubble } from '@/components/chat/AudioBubble';
import { Avatar } from '@/components/ui/Avatar';
import type { MessageWithSender } from '@/types';

type Props = {
  message: MessageWithSender;
  isOwn: boolean;
  /** The message this one replies to, resolved by the parent from the
   *  loaded window (null = quoted message not in the last 100). */
  repliedTo?: MessageWithSender | null;
  viewerId: string | null;
  /** The viewer's favourite emoji — powers the desktop hover chip. */
  favoriteReaction?: string;
  onLongPress?: (message: MessageWithSender) => void;
  onPressAvatar?: (userId: string) => void;
  onToggleReaction?: (message: MessageWithSender, emoji: string) => void;
  /** Swipe (native) → reply, same as Telegram. */
  onReply?: (message: MessageWithSender) => void;
  /** Web right-click → same action menu as long-press. */
  onContextMenu?: (message: MessageWithSender) => void;
};

const isWeb = Platform.OS === 'web';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** One-line summary of a message for the reply quote. */
function snippet(m: MessageWithSender): string {
  switch (m.type) {
    case 'text':
      return m.text ?? '';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'location':
      return '📍 Location';
    case 'audio':
      return '🎤 Voice message';
    case 'system':
      return m.text ?? '';
  }
}

/** Renders one chat message: optional reply quote, body, meta row with
 *  time + ✓/✓✓ ticks on own messages, and tappable reaction chips.
 *
 *  Interactions:
 *   - long-press (all platforms) → action menu
 *   - swipe right-to-left (native) → reply, Telegram-style
 *   - right-click (web) → same action menu
 *   - hover (web) → quick-react chip with the viewer's favourite emoji
 */
export function MessageBubble({
  message,
  isOwn,
  repliedTo,
  viewerId,
  favoriteReaction,
  onLongPress,
  onPressAvatar,
  onToggleReaction,
  onReply,
  onContextMenu,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<View | null>(null);

  // Web right-click: RN-web forwards the View ref to the DOM node, so
  // we can hang a real contextmenu listener off it.
  useEffect(() => {
    if (!isWeb || !onContextMenu) return;
    const node = rowRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const handler = (e: Event) => {
      e.preventDefault();
      onContextMenu(message);
    };
    node.addEventListener('contextmenu', handler);
    return () => node.removeEventListener('contextmenu', handler);
  }, [onContextMenu, message]);

  // Native swipe-to-reply: horizontal drag, translate the bubble as it
  // moves (capped), fire onReply past the threshold.
  const dragX = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => {
    if (isWeb || !onReply || message.type === 'system') return null;
    return PanResponder.create({
      // Claim the gesture only for clearly-horizontal right-to-left
      // drags so the FlatList keeps vertical scrolling.
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => {
        dragX.setValue(Math.max(-88, Math.min(0, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -56) onReply(message);
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
      },
    });
  }, [onReply, message, dragX]);

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
  const read = message.read_by.length > 0;
  const reactionEntries = Object.entries(message.reactions ?? {}).filter(
    ([, users]) => users.length > 0,
  );

  // Hover quick-react chip (web/desktop). Sits on the outer side of the
  // bubble; clicking toggles the favourite emoji.
  const quickReact =
    isWeb && hovered && favoriteReaction && onToggleReaction ? (
      <Pressable
        onPress={() => onToggleReaction(message, favoriteReaction)}
        accessibilityLabel={`React ${favoriteReaction}`}
        className="mx-1.5 h-8 w-8 items-center justify-center self-center rounded-full border border-border-light bg-elevated-light shadow-sm shadow-black/20 dark:border-border-dark dark:bg-elevated-dark"
      >
        <Text style={{ fontSize: 15 }}>{favoriteReaction}</Text>
      </Pressable>
    ) : null;

  const bubble = (
    <View className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
      <Pressable
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={350}
        className={[
          'rounded-2xl px-3.5 py-2.5',
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

        {message.reply_to ? (
          <View
            className={[
              'mb-1.5 rounded-lg border-l-2 px-2 py-1',
              isOwn
                ? 'border-surface-light/60 bg-surface-light/10 dark:border-surface-dark/60 dark:bg-surface-dark/10'
                : 'border-brand-500 bg-brand-500/10',
            ].join(' ')}
          >
            <Text
              className={
                isOwn
                  ? 'text-[11px] font-semibold text-surface-light/90 dark:text-surface-dark/90'
                  : 'text-[11px] font-semibold text-brand-500'
              }
              numberOfLines={1}
            >
              {repliedTo?.sender?.display_name ?? 'Original message'}
            </Text>
            <Text
              className={
                isOwn
                  ? 'text-[12px] text-surface-light/70 dark:text-surface-dark/70'
                  : 'text-[12px] text-muted-light dark:text-muted-dark'
              }
              numberOfLines={1}
            >
              {repliedTo ? snippet(repliedTo) : 'Message unavailable'}
            </Text>
          </View>
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
        ) : message.type === 'audio' && message.media_url ? (
          <AudioBubble
            uri={message.media_url}
            durationMs={message.duration_ms}
            waveform={message.waveform}
            isOwn={isOwn}
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

        <View className="mt-1 flex-row items-center gap-1 self-end">
          <Text
            className={[
              'font-mono text-[9px] uppercase',
              isOwn
                ? 'text-surface-light/60 dark:text-surface-dark/60'
                : 'text-muted-light',
            ].join(' ')}
          >
            {timeLabel(message.created_at)}
          </Text>
          {isOwn ? (
            <Text
              className={
                read
                  ? 'text-[11px] font-semibold text-brand-300'
                  : 'text-[11px] text-surface-light/60 dark:text-surface-dark/60'
              }
            >
              {read ? '✓✓' : '✓'}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {reactionEntries.length > 0 ? (
        <View
          className={`mt-1 flex-row flex-wrap gap-1 ${isOwn ? 'justify-end' : ''}`}
        >
          {reactionEntries.map(([emoji, users]) => {
            const mine = !!viewerId && users.includes(viewerId);
            return (
              <Pressable
                key={emoji}
                onPress={() => onToggleReaction?.(message, emoji)}
                className={[
                  'flex-row items-center gap-1 rounded-full border px-2 py-0.5',
                  mine
                    ? 'border-brand-500 bg-brand-500/15'
                    : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                ].join(' ')}
              >
                <Text style={{ fontSize: 12 }}>{emoji}</Text>
                <Text
                  className={
                    mine
                      ? 'text-[10px] font-bold text-brand-500'
                      : 'text-[10px] font-semibold text-muted-light'
                  }
                >
                  {users.length}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const row = (
    <View
      ref={rowRef}
      className={`my-0.5 flex-row px-4 ${isOwn ? 'justify-end' : 'justify-start'}`}
      {...(isWeb
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : null)}
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
      {/* Own bubbles: chip appears on the LEFT (outer) side. */}
      {isOwn ? quickReact : null}
      {bubble}
      {/* Incoming bubbles: chip on the RIGHT (outer) side. */}
      {!isOwn ? quickReact : null}
    </View>
  );

  // Native: wrap in the swipe-to-reply pan handler; a reply arrow hint
  // fades in behind the bubble as it slides.
  if (panResponder) {
    const hintOpacity = dragX.interpolate({
      inputRange: [-88, -40, 0],
      outputRange: [1, 0.5, 0],
    });
    return (
      <View>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 16,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            opacity: hintOpacity,
          }}
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark">
            <Ionicons name="arrow-undo" size={15} color="#4B5FE0" />
          </View>
        </Animated.View>
        <Animated.View
          style={{ transform: [{ translateX: dragX }] }}
          {...panResponder.panHandlers}
        >
          {row}
        </Animated.View>
      </View>
    );
  }

  return row;
}
