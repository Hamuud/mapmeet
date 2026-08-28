import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  DEFAULT_STAR_GLYPH,
  MAX_EFFECT_GLYPHS,
} from '@/features/events/pinStyle';
import { useT } from '@/i18n';
import { firstEmoji } from '@/utils/emoji';

/** A few obvious ones so the common case is a single tap. */
const QUICK_GLYPHS = ['❤️', '⭐', '🔥', '❄️', '🎈', '🍀'];

type Props = {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
};

/** Which emoji fall past a pin using the "falling stars" effect.
 *
 *  Designer-only, and only meaningful while that effect is selected —
 *  the caller decides when to show it. Up to three, because the effect
 *  draws three particles; fewer cycles. An array all the way down, never
 *  a packed string: emoji are grapheme clusters and splitting '👽🌸'
 *  back apart in JS mangles ZWJ sequences. */
export function PinGlyphField({ value, onChange }: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const glyphs = value ?? [];
  const full = glyphs.length >= MAX_EFFECT_GLYPHS;

  const add = (glyph: string) => {
    // One emoji, or nothing — same rule as the event's own emoji field,
    // and for the same reason: this used to take whatever was typed, so
    // a stray letter became a particle falling past the pin.
    const g = firstEmoji(glyph);
    if (!g || full || glyphs.includes(g)) return;
    onChange([...glyphs, g].slice(0, MAX_EFFECT_GLYPHS));
  };

  const removeAt = (i: number) => {
    const next = glyphs.filter((_, j) => j !== i);
    // Empty means "use the default sparkle" — store null rather than an
    // empty array so the column matches what the effect actually does.
    onChange(next.length ? next : null);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {t('pinStyle.fallingGlyphs')}
        </Text>
        <Text className="text-[11px] text-muted-light dark:text-muted-dark">
          {glyphs.length}/{MAX_EFFECT_GLYPHS}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {glyphs.map((g, i) => (
          <Pressable
            key={`${g}-${i}`}
            onPress={() => removeAt(i)}
            accessibilityLabel={t('pinStyle.removeGlyph', { glyph: g })}
            className="h-11 flex-row items-center gap-1.5 rounded-2xl border border-border-light bg-elevated-light px-3 dark:border-border-dark dark:bg-elevated-dark"
          >
            <Text style={{ fontSize: 18 }}>{g}</Text>
            <Ionicons name="close" size={12} color="#8B8880" />
          </Pressable>
        ))}

        {glyphs.length === 0 ? (
          <View className="h-11 flex-row items-center gap-2 rounded-2xl border border-dashed border-border-light px-3 dark:border-border-dark">
            <Text style={{ fontSize: 16 }}>{DEFAULT_STAR_GLYPH}</Text>
            <Text className="text-[12px] text-muted-light dark:text-muted-dark">
              {t('pinStyle.defaultGlyph')}
            </Text>
          </View>
        ) : null}
      </View>

      {!full ? (
        <View className="flex-row items-center gap-2">
          <View className="h-11 w-24 justify-center rounded-xl border border-border-light bg-elevated-light px-3 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={draft}
              onChangeText={(v) => {
                // Commit as soon as an emoji lands — this field only
                // ever holds one, so there is nothing to confirm. Text
                // that isn't an emoji leaves the draft where it was, so
                // the keystroke simply doesn't take.
                if (firstEmoji(v)) {
                  add(v);
                  setDraft('');
                  return;
                }
                setDraft(v.trim() ? draft : '');
              }}
              placeholder="🚀"
              placeholderTextColor="#8B8880"
              // Same cap as the event emoji field: a family or flag is
              // several UTF-16 units and must not be chopped mid-pair.
              maxLength={16}
              accessibilityLabel={t('pinStyle.addGlyph')}
              className="text-lg text-text-light outline-none dark:text-text-dark"
            />
          </View>

          <View className="flex-1 flex-row flex-wrap gap-1.5">
            {QUICK_GLYPHS.filter((g) => !glyphs.includes(g)).map((g) => (
              <Pressable
                key={g}
                onPress={() => add(g)}
                accessibilityLabel={t('pinStyle.addGlyphNamed', { glyph: g })}
                className="h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark"
              >
                <Text style={{ fontSize: 16 }}>{g}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
