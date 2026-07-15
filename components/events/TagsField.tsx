import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { appendTag, normalizeTag } from '@/utils/tags';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string;
};

/** Chip-style multi-tag input. Enter, space, or comma commits the
 *  current draft; Backspace on an empty draft removes the previous chip.
 *  We normalize (lowercase + dash) inside `appendTag` so what the user
 *  sees is what actually lands in Postgres. */
export function TagsField({ value, onChange, error }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const atMax = value.length >= 5;

  const commit = (raw: string) => {
    // Explain to the user why a tag wasn't added instead of silently
    // eating the input. Silent-fail was the root cause of the
    // "mixed-language tags don't add" reports — the user typed the
    // second tag, hit space, and nothing visible happened, so it
    // looked broken. Now they get a toast explaining the constraint
    // (too short, duplicate, hit the 5-cap, wrong shape).
    const normalized = normalizeTag(raw);
    if (!normalized) {
      // Only show the "too short" toast if the user actually typed
      // something — a bare separator press with an empty draft is a
      // no-op, not an error.
      if (raw.trim().length > 0) {
        toast.show('Tags need at least 2 characters.', 'info');
      }
      setDraft('');
      return;
    }
    if (value.includes(normalized)) {
      toast.show(`"${normalized}" is already on the list.`, 'info');
      setDraft('');
      return;
    }
    if (value.length >= 5) {
      toast.show('Up to 5 tags per event.', 'info');
      return;
    }
    const next = appendTag(value, raw);
    if (next !== value) onChange(next);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <View className="w-full">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-text-light dark:text-text-dark">
          Tags
        </Text>
        <Text className="text-[11px] text-muted-light dark:text-muted-dark">
          {value.length}/5 · at least one
        </Text>
      </View>

      <View
        className={[
          'flex-row flex-wrap items-center gap-2 rounded-2xl border px-3 py-2',
          'bg-elevated-light dark:bg-elevated-dark',
          error ? 'border-red-500' : 'border-border-light dark:border-border-dark',
        ].join(' ')}
      >
        {value.map((tag) => (
          <View
            key={tag}
            className="flex-row items-center gap-1 rounded-full bg-brand-500/15 px-2.5 py-1"
          >
            <Text className="text-xs font-semibold text-brand-500">#{tag}</Text>
            <Pressable
              onPress={() => remove(tag)}
              accessibilityLabel={`Remove ${tag}`}
              hitSlop={6}
            >
              <Ionicons name="close" size={12} color="#3757FF" />
            </Pressable>
          </View>
        ))}

        {!atMax ? (
          <TextInput
            value={draft}
            onChangeText={(t) => {
              // Commit as soon as the user types a separator so they can
              // rattle off "coffee, study, chill" naturally.
              if (/[\s,]$/.test(t)) commit(t);
              else setDraft(t);
            }}
            onSubmitEditing={() => commit(draft)}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Backspace' && draft.length === 0 && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length === 0 ? 'e.g. coffee, кава, 咖啡' : 'Add another'}
            placeholderTextColor="#8B8880"
            autoCapitalize="none"
            autoCorrect={false}
            className="min-w-[80px] flex-1 text-sm text-text-light outline-none dark:text-text-dark"
          />
        ) : null}
      </View>

      {error ? (
        <Text className="mt-1.5 text-xs text-red-500">{error}</Text>
      ) : (
        <Text className="mt-1.5 text-[11px] text-muted-light dark:text-muted-dark">
          Enter, comma or space commits. Backspace on empty removes the last.
        </Text>
      )}
    </View>
  );
}
