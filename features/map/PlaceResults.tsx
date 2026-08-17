import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { GeocodeResult } from '@/services/geocoding.service';

type Props = {
  places: GeocodeResult[];
  onPick: (place: GeocodeResult) => void;
};

/** Places matching the search box, offered under it.
 *
 *  Deliberately capped at three and visually quieter than the events they
 *  sit above: the common case is still searching for an event by name,
 *  and this must not look like the primary result. */
export function PlaceResults({ places, onPick }: Props) {
  const t = useT();
  if (places.length === 0) return null;

  return (
    <View className="mt-2 overflow-hidden rounded-xl border border-border-light bg-panel-light shadow-md shadow-black/10 dark:border-border-dark dark:bg-panel-dark">
      <Text className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-light">
        {t('search.places')}
      </Text>
      {places.map((place, i) => (
        <Pressable
          key={`${place.label}-${i}`}
          onPress={() => onPick(place)}
          className={[
            'flex-row items-center gap-2.5 px-3 py-2.5 active:opacity-70',
            i > 0 ? 'border-t border-border-light dark:border-border-dark' : '',
          ].join(' ')}
        >
          <Ionicons name="navigate-circle-outline" size={16} color="#4B5FE0" />
          <Text
            className="flex-1 text-[13px] text-text-light dark:text-text-dark"
            numberOfLines={1}
          >
            {place.label}
          </Text>
          <Ionicons name="arrow-forward" size={12} color="#8B8880" />
        </Pressable>
      ))}
    </View>
  );
}
