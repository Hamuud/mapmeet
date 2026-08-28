import { Pressable, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { firstEmoji } from '@/utils/emoji';

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
  const t = useT();

  // The paste field has no state of its own — it IS the selection,
  // blanked whenever the selection came from the row of quick picks.
  //
  // It used to hold a separate draft, which is where two bugs lived.
  // Whatever was typed went straight through, so "hello" or three emoji
  // in a row were both accepted and both ended up on the map. And
  // because the draft never heard about the quick picks, tapping one
  // left the previous custom emoji sitting in the field, contradicting
  // the pin preview right above it.
  const custom = QUICK_PICKS.includes(value) ? '' : value;

  return (
    <View className="gap-3">
      {/* Selected emoji + free-form paste input side-by-side */}
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
          <Text style={{ fontSize: 30 }}>{value || '❓'}</Text>
        </View>
        <View className="flex-1">
          <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
            {t('emoji.pasteAny')}
          </Text>
          <TextInput
            value={custom}
            onChangeText={(next) => {
              // Clearing the field clears the choice; the form's own
              // "pick an emoji" rule then has something to complain
              // about, which is more honest than quietly keeping the
              // emoji they just deleted.
              if (next.trim().length === 0) {
                onChange('');
                return;
              }
              // One emoji, or nothing at all. Returning without calling
              // onChange re-renders the field at its previous value, so
              // a typed letter never appears — the rejection reads as
              // the keystroke not registering, which is what a field
              // that only takes emoji should feel like.
              const one = firstEmoji(next);
              if (one) onChange(one);
            }}
            placeholder="🚀"
            placeholderTextColor="#8B8880"
            // Long enough for any single cluster to arrive intact before
            // firstEmoji trims it — a paste is delivered whole, and
            // cutting it here would sever a ZWJ sequence mid-pair. The
            // DB CHECK (char_length between 1 and 8) is still the
            // backstop for absurdly long ones.
            maxLength={64}
            autoCapitalize="none"
            autoCorrect={false}
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
              accessibilityLabel={t('emoji.pick', { emoji: item })}
            >
              <Text style={{ fontSize: 22 }}>{item}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
