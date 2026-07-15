import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { geocodingService, type GeocodeResult } from '@/services/geocoding.service';

type Props = {
  onSelect: (result: GeocodeResult) => void;
};

/** Autocomplete address bar. Types → 300 ms debounce → Nominatim →
 *  dropdown of matches → picking one bubbles a LatLng up. Purely a
 *  helper — the sheet still owns the source-of-truth coords. */
export function AddressField({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await geocodingService.search(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setResults(hits);
          setExpanded(true);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return (
    <View>
      <View
        className={[
          'flex-row items-center rounded-2xl border px-4',
          'bg-elevated-light dark:bg-elevated-dark',
          'border-border-light dark:border-border-dark',
          'h-12',
        ].join(' ')}
      >
        <Ionicons name="search" size={16} color="#8E8E93" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search address"
          placeholderTextColor="#8E8E93"
          autoCapitalize="none"
          autoCorrect={false}
          className="ml-2 flex-1 text-base text-text-light outline-none dark:text-text-dark"
          onFocus={() => setExpanded(true)}
        />
        {loading ? <ActivityIndicator size="small" color="#3757FF" /> : null}
      </View>

      {expanded && results.length > 0 ? (
        // Plain stacked <View>s — not a FlatList — because the sheet's
        // outer ScrollView is vertical and RN's virtualization
        // (FlatList / SectionList) inside a same-orientation ScrollView
        // both breaks windowing and warns the user with a big red
        // console error. Nominatim caps at 5 results anyway, so there's
        // nothing to virtualize.
        <View className="mt-2 overflow-hidden rounded-2xl border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark">
          {results.map((item, idx) => (
            <Pressable
              key={`${item.coords.latitude}-${item.coords.longitude}-${idx}`}
              onPress={() => {
                onSelect(item);
                setQuery(item.label);
                setExpanded(false);
                setResults([]);
              }}
              className={[
                'px-4 py-3 active:opacity-70',
                idx < results.length - 1
                  ? 'border-b border-border-light dark:border-border-dark'
                  : '',
              ].join(' ')}
            >
              <Text
                className="text-sm text-text-light dark:text-text-dark"
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
