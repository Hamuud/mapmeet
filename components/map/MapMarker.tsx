import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type Props = {
  emoji: string;
  title?: string;
  selected?: boolean;
  compact?: boolean;
  isPrivate?: boolean;
  /** Rendered in the coral accent — use for "you're hosting this". */
  hosted?: boolean;
};

// New pin shape: rounded-rect tag with a slight bottom-left corner clip
// evoking a pin, plus a small dot underneath aligned to the map point.
export function MapMarker({ emoji, title, selected, compact, isPrivate, hosted }: Props) {
  return (
    <View className="items-center">
      <View
        style={{
          borderBottomLeftRadius: 4,
          transform: [{ rotate: selected ? '0deg' : '-4deg' }],
        }}
        className={[
          'items-center justify-center rounded-2xl border',
          selected
            ? 'bg-text-light dark:bg-text-dark border-text-light dark:border-text-dark'
            : hosted
              ? 'bg-accent-400 border-accent-400'
              : 'bg-panel-light dark:bg-panel-dark border-border-light dark:border-border-dark',
          selected ? 'h-12 w-12' : 'h-11 w-11',
          selected ? 'shadow-lg shadow-black/40' : 'shadow-md shadow-black/20',
        ].join(' ')}
      >
        <Text style={{ fontSize: selected ? 24 : 22 }}>{emoji}</Text>
        {isPrivate ? (
          <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full border border-panel-light bg-text-light dark:border-panel-dark dark:bg-text-dark">
            <Ionicons name="lock-closed" size={8} color="#F6F4EE" />
          </View>
        ) : null}
      </View>
      {/* Point dot */}
      <View
        className={[
          'mt-1 h-1.5 w-1.5 rounded-full',
          selected
            ? 'bg-text-light dark:bg-text-dark'
            : hosted
              ? 'bg-accent-400'
              : 'bg-text-light/80 dark:bg-text-dark/80',
        ].join(' ')}
      />
      {title && !compact ? (
        <View className="mt-1 rounded-full bg-text-light/85 px-2 py-0.5 dark:bg-text-dark/85">
          <Text className="text-[10px] font-semibold text-surface-light dark:text-surface-dark" numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** "You're placing a marker here" state — the only place coral appears
 *  on the map alongside the create FAB. */
export function PendingMarker() {
  return (
    <View className="items-center">
      <View
        className="items-center justify-center rounded-2xl border border-accent-400 bg-accent-400 shadow-lg shadow-black/30"
        style={{ width: 44, height: 44, borderBottomLeftRadius: 4 }}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </View>
      <View className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-400" />
      <View className="mt-1 rounded-full bg-accent-400 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-white">New event here</Text>
      </View>
    </View>
  );
}
