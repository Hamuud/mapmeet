import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useIconColor } from '@/hooks/useIconColor';
import type { MapStyle } from './Map.types';

type Option = {
  value: MapStyle;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const OPTIONS: Option[] = [
  { value: 'streets', label: 'Streets', icon: 'map' },
  { value: 'satellite', label: 'Satellite', icon: 'globe' },
  { value: 'terrain', label: 'Terrain', icon: 'trail-sign' },
];

type Props = {
  value: MapStyle;
  onChange: (style: MapStyle) => void;
};

/** Floating layer picker. Collapses to a single icon button; tap to
 *  expand into a three-way segmented control. Kept intentionally small
 *  so it doesn't crowd the map on phone-width. */
export function MapStyleSwitcher({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const iconColor = useIconColor();
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]!;

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Change map style"
        className="h-10 flex-row items-center gap-2 rounded-full border border-border-light bg-panel-light px-3 shadow-sm shadow-black/10 dark:border-border-dark dark:bg-panel-dark"
      >
        <Ionicons name="layers" size={14} color={iconColor} />
        <Text className="text-xs font-semibold text-text-light dark:text-text-dark">
          {current.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-row items-center rounded-full border border-border-light bg-panel-light p-1 shadow-sm shadow-black/10 dark:border-border-dark dark:bg-panel-dark">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            className={[
              'h-8 flex-row items-center gap-1.5 rounded-full px-3',
              active
                ? 'bg-text-light dark:bg-text-dark'
                : 'bg-transparent',
            ].join(' ')}
            accessibilityLabel={opt.label}
          >
            <Ionicons
              name={opt.icon}
              size={12}
              color={active ? '#F6F4EE' : iconColor}
            />
            <Text
              className={[
                'text-xs font-semibold',
                active
                  ? 'text-surface-light dark:text-surface-dark'
                  : 'text-text-light dark:text-text-dark',
              ].join(' ')}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
