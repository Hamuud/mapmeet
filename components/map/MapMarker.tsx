import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type Props = {
  emoji: string;
  title?: string;
  selected?: boolean;
  compact?: boolean;
  isPrivate?: boolean;
};

export function MapMarker({ emoji, title, selected, compact, isPrivate }: Props) {
  return (
    <View className="items-center">
      <View
        className={[
          'items-center justify-center rounded-full border-2',
          'border-white bg-surface-light dark:bg-surface-dark',
          selected ? 'h-14 w-14' : 'h-12 w-12',
          selected ? 'shadow-lg shadow-brand-500/60' : 'shadow-md shadow-black/25',
        ].join(' ')}
      >
        <Text style={{ fontSize: selected ? 26 : 22 }}>{emoji}</Text>
        {isPrivate ? (
          <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full border border-white bg-amber-500">
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
      {title && !compact ? (
        <View className="mt-1 rounded-full bg-black/70 px-2 py-0.5">
          <Text className="text-[10px] font-semibold text-white" numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Distinct visual for the "you're placing a marker here" state. Kept in
 *  the same file so it stays in lockstep with MapMarker's sizing. */
export function PendingMarker() {
  return (
    <View className="items-center">
      <View
        className="items-center justify-center rounded-full border-2 border-white bg-brand-500 shadow-lg shadow-brand-500/60"
        style={{ width: 44, height: 44 }}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </View>
      <View className="mt-1 rounded-full bg-brand-500 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-white">New event here</Text>
      </View>
    </View>
  );
}
