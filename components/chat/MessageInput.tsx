import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { useIconColor } from '@/hooks/useIconColor';

type Props = {
  onSend: (text: string) => Promise<void>;
  onAttach?: () => void;
};

/** Bottom input bar: [+] attachment · text field · coral send. The
 *  parent owns keyboard avoidance; this stays a dumb row. */
export function MessageInput({ onSend, onAttach }: Props) {
  const iconColor = useIconColor();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = draft.trim().length > 0 && !sending;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    // Clear immediately so fast typers can queue the next line while
    // the round-trip is in flight; restore on failure.
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
    <View className="flex-row items-end gap-2 border-t border-border-light bg-panel-light px-3 py-2 dark:border-border-dark dark:bg-panel-dark">
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
          className="text-[15px] text-text-light outline-none dark:text-text-dark"
          style={{ maxHeight: 96 }}
        />
      </View>

      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityLabel="Send message"
        className={[
          'h-11 w-11 items-center justify-center rounded-full',
          canSend ? 'bg-accent-400' : 'bg-elevated-light dark:bg-elevated-dark',
        ].join(' ')}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="paper-plane" size={17} color={canSend ? '#fff' : '#8B8880'} />
        )}
      </Pressable>
    </View>
  );
}
