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

import { useT, type TFunction } from '@/i18n';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CHAT_MEDIA_ATTACHMENTS } from '@/config/features';
import { useIconColor } from '@/hooks/useIconColor';
import type { MessageWithSender } from '@/types';

type Props = {
  onSend: (text: string) => Promise<void>;
  onAttach?: () => void;
  /** When provided, the [+] offers a poll. While media attachments are
   *  disabled it is the only entry, so [+] opens the composer directly
   *  rather than a one-item menu. */
  onCreatePoll?: () => void;
  /** Reply context — renders the quoted strip above the input. */
  replyingTo?: MessageWithSender | null;
  onCancelReply?: () => void;
  /** Called on each keystroke so the room can tell the others somebody
   *  is writing. Throttled by `useTyping`, not here — the composer
   *  should not have to know how often is too often. */
  onTyping?: () => void;
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

function replySnippet(m: MessageWithSender, t: TFunction): string {
  switch (m.type) {
    case 'text':
      return m.text ?? '';
    case 'image':
      return t('chat.photo');
    case 'video':
      return t('chat.video');
    case 'location':
      return t('chat.locationMsg');
    case 'audio':
      return t('chat.voiceMessage');
    case 'poll':
      return `📊 ${m.poll?.question ?? t('chat.poll')}`;
    case 'invite':
      return t('chat.eventInvite');
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
  onCreatePoll,
  replyingTo,
  onCancelReply,
  onTyping,
  recording,
  recordingMs = 0,
  onStartVoice,
  onFinishVoice,
  onCancelVoice,
}: Props) {
  const t = useT();
  const iconColor = useIconColor();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasText = draft.trim().length > 0;

  // What [+] does: the full menu when there's a real choice, otherwise
  // whichever single action is available, otherwise nothing at all —
  // no button is better than one that apologises.
  const canAttach = CHAT_MEDIA_ATTACHMENTS && !!onAttach;
  const plusAction =
    canAttach && onCreatePoll
      ? () => setMenuOpen(true)
      : (onCreatePoll ?? (canAttach ? onAttach : null));

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
              {t('input.replyingTo', { name: replyingTo.sender?.display_name ?? t('input.aMessage') })}
            </Text>
            <Text
              className="text-[12px] text-muted-light dark:text-muted-dark"
              numberOfLines={1}
            >
              {replySnippet(replyingTo, t)}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8} accessibilityLabel={t('input.cancelReply')}>
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
            {t('input.recording')}
          </Text>
          <Pressable
            onPress={onCancelVoice}
            accessibilityLabel={t('input.cancelRecording')}
            className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
          >
            <Ionicons name="trash-outline" size={17} color="#B91C1C" />
          </Pressable>
          <Pressable
            onPress={onFinishVoice}
            accessibilityLabel={t('input.sendVoice')}
            className="h-11 w-11 items-center justify-center rounded-full bg-accent-400"
          >
            <Ionicons name="paper-plane" size={17} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-end gap-2 px-3 py-2">
          {plusAction ? (
            <Pressable
              onPress={plusAction}
              accessibilityLabel={
                !canAttach && onCreatePoll
                  ? t('input.createPoll')
                  : t('input.addAttachment')
              }
              className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
            >
              <Ionicons name="add" size={20} color={iconColor} />
            </Pressable>
          ) : null}

          <View className="max-h-28 min-h-[44px] flex-1 justify-center rounded-3xl border border-border-light bg-elevated-light px-4 py-2 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                // Only on real input, never on the programmatic clear
                // after sending — otherwise every send would announce
                // that you had started typing again.
                if (v.length > 0) onTyping?.();
              }}
              placeholder={t('room.messagePlaceholder')}
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
              accessibilityLabel={t('input.sendMessage')}
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
              accessibilityLabel={t('input.recordVoice')}
              className="h-11 w-11 items-center justify-center rounded-full border border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark"
            >
              <Ionicons name="mic" size={18} color={iconColor} />
            </Pressable>
          )}
        </View>
      )}

      {/* [+] menu — only reachable while there is more than one choice. */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} autoHeight>
        <View className="gap-1 pb-1">
          {canAttach ? (
            <AttachMenuItem
              icon="image-outline"
              label={t('input.photoOrVideo')}
              onPress={() => {
                setMenuOpen(false);
                onAttach?.();
              }}
            />
          ) : null}
          <AttachMenuItem
            icon="stats-chart"
            label={t('input.createPoll')}
            onPress={() => {
              setMenuOpen(false);
              onCreatePoll?.();
            }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function AttachMenuItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
        <Ionicons name={icon} size={19} color="#4B5FE0" />
      </View>
      <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
        {label}
      </Text>
    </Pressable>
  );
}
