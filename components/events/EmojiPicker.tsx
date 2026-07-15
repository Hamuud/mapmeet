import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

/** Just the crowd-favourites. The old ~80-emoji grid took up more than a
 *  screen height in the "Pin an event" sheet — users kept scrolling
 *  past it. Anything not in this quick row can be pasted via the
 *  right-hand "any emoji" field. */
const QUICK_PICKS = ['🎉', '🍕', '🍺', '☕', '⚽'];

type Props = {
  value: string;
  onChange: (emoji: string) => void;
};

export function EmojiPicker({ value, onChange }: Props) {
  const [custom, setCustom] = useState('');

  return (
    <View className="gap-3">
      {/* Selected emoji + free-form paste input side-by-side */}
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
          <Text style={{ fontSize: 30 }}>{value || '❓'}</Text>
        </View>
        <View className="flex-1">
          <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
            Or paste any emoji
          </Text>
          <TextInput
            value={custom}
            onChangeText={(t) => {
              setCustom(t);
              if (t.trim().length > 0) onChange(t.trim());
            }}
            placeholder="🚀"
            placeholderTextColor="#8B8880"
            // maxLength counts UTF-16 code units in JS/RN, not user-
            // perceived emoji. A rainbow flag 🏳️‍🌈 is 6 units and a
            // family 👨‍👩‍👧‍👦 is 11 — the old cap of 4 chopped ZWJ
            // sequences mid-pair and the map showed either garbage
            // or nothing. 32 comfortably fits any single emoji cluster
            // while the DB CHECK (char_length between 1 and 8) still
            // gates absurd input at the storage layer.
            maxLength={32}
            className="h-11 rounded-xl border border-border-light bg-panel-light px-4 text-lg text-text-light outline-none dark:border-border-dark dark:bg-panel-dark dark:text-text-dark"
          />
        </View>
      </View>

      {/* Quick picks — five tap targets. Keeps the sheet short. */}
      <View className="flex-row gap-2">
        {QUICK_PICKS.map((item) => {
          const active = item === value;
          return (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              className={[
                'h-12 flex-1 items-center justify-center rounded-2xl border',
                active
                  ? 'border-brand-500 bg-brand-500/15'
                  : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
              ].join(' ')}
              accessibilityLabel={`Pick ${item}`}
            >
              <Text style={{ fontSize: 22 }}>{item}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
