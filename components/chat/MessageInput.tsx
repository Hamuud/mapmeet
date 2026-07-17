import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useIconColor } from '@/hooks/useIconColor';
import type { MessageWithSender } from '@/types';

type Props = {
  onSend: (text: string) => Promise<void>;
  onAttach?: () => void;
  /** Reply context — renders the quoted strip above the input. */
  replyingTo?: MessageWithSender | null;
  onCancelReply?: () => void;
  /** Voice recording controls (wired to useVoiceRecorder in the room). */
  recording?: boolean;
  recordingMs?: number;
  onStartVoice?: () => void;
  onFinishVoice?: () => void;
  onCancelVoice?: () => void;
};

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function replySnippet(m: MessageWithSender): string {
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

/** Bottom input bar: [+] attachment · text field · mic (empty draft) or
 *  coral send (has text). While recording, the bar swaps to a red-dot
 *  timer with cancel + send. A reply strip docks above when replying. */
export function MessageInput({
  onSend,
  onAttach,
  replyingTo,
  onCancelReply,
  recording,
  recordingMs = 0,
  onStartVoice,
  onFinishVoice,
  onCancelVoice,
}: Props) {
  const iconColor = useIconColor();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const hasText = draft.trim().length > 0;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(text);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="border-t border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark">
      {/* Reply strip */}
      {replyingTo ? (
        <View className="flex-row items-center gap-2 border-b border-border-light px-4 py-2 dark:border-border-dark">
          <View className="h-8 w-0.5 rounded-full bg-brand-500" />
          <View className="flex-1">
            <Text className="text-[11px] font-semibold text-brand-500" numberOfLines={1}>
              Replying to {replyingTo.sender?.display_name ?? 'message'}
            </Text>
            <Text
              className="text-[12px] text-muted-light dark:text-muted-dark"
              numberOfLines={1}
            >
              {replySnippet(replyingTo)}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8} accessibilityLabel="Cancel reply">
            <Ionicons name="close-circle" size={18} color="#8B8880" />
          </Pressable>
        </View>
      ) : null}

      {recording ? (
        // Recording bar: red dot + elapsed + cancel + send
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <Text className="font-mono text-sm text-text-light dark:text-text-dark">
            {fmt(recordingMs)}
          </Text>
          <Text className="flex-1 text-xs text-muted-light dark:text-muted-dark">
            Recording…
          </Text>
          <Pressable
            onPress={onCancelVoice}
            accessibilityLabel="Cancel recording"
            className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
          >
            <Ionicons name="trash-outline" size={17} color="#B91C1C" />
          </Pressable>
          <Pressable
            onPress={onFinishVoice}
            accessibilityLabel="Send voice message"
            className="h-11 w-11 items-center justify-center rounded-full bg-accent-400"
          >
            <Ionicons name="paper-plane" size={17} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-end gap-2 px-3 py-2">
          <Pressable
            onPress={onAttach}
            accessibilityLabel="Add attachment"
            className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
          >
            <Ionicons name="add" size={20} color={iconColor} />
          </Pressable>

          <View className="max-h-28 min-h-[44px] flex-1 justify-center rounded-3xl border border-border-light bg-elevated-light px-4 py-2 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the group…"
              placeholderTextColor="#8B8880"
              multiline
              // Desktop web: Enter sends, Shift+Enter makes a newline —
              // same contract as Telegram/Slack. RN-web fires onKeyPress
              // from keydown, so preventDefault stops the newline from
              // landing in the textarea before we send.
              onKeyPress={(e) => {
                if (Platform.OS !== 'web') return;
                const key = e.nativeEvent as unknown as {
                  key: string;
                  shiftKey?: boolean;
                };
                if (key.key === 'Enter' && !key.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              className="text-[15px] text-text-light outline-none dark:text-text-dark"
              style={{ maxHeight: 96 }}
            />
          </View>

          {hasText ? (
            <Pressable
              onPress={handleSend}
              disabled={sending}
              accessibilityLabel="Send message"
              className="h-11 w-11 items-center justify-center rounded-full bg-accent-400"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="paper-plane" size={17} color="#fff" />
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={onStartVoice}
              accessibilityLabel="Record voice message"
              className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
            >
              <Ionicons name="mic" size={18} color={iconColor} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
