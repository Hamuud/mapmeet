import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { useT } from '@/i18n';
import { formatRelativeTime } from '@/utils/format';
import type { MessageWithSender } from '@/types';

const DEBOUNCE_MS = 300;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Runs the query against whichever room opened this. */
  search: (query: string) => Promise<MessageWithSender[]>;
  /** Tapping a hit hands the message back so the room can reveal it. */
  onPick: (message: MessageWithSender) => void;
};

/** Find a message in this conversation.
 *
 *  One sheet for all three room kinds — event, DM and group — because
 *  the only thing that differs is which table the query hits, and that
 *  arrives as a function. Writing it three times is how the event chat
 *  would end up with a feature the group chat quietly lacks. */
export function MessageSearchSheet({ open, onClose, search, onPick }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessageWithSender[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  // Reset on open so the sheet never shows the last search's hits.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setRan(false);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setRan(false);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(() => {
      search(q)
        .then((rows) => {
          if (!cancelled) {
            setResults(rows);
            setRan(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setRan(true);
          }
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `search` is rebuilt on every render of the room; depending on it
    // would re-run the query continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8}>
      <View className="flex-1 gap-3">
        <View className="h-11 flex-row items-center rounded-xl border border-border-light bg-elevated-light px-3.5 dark:border-border-dark dark:bg-elevated-dark">
          <Ionicons name="search" size={16} color="#8B8880" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('room.searchPlaceholder')}
            placeholderTextColor="#8B8880"
            autoFocus
            returnKeyType="search"
            className="ml-2 flex-1 text-[15px] text-text-light outline-none dark:text-text-dark"
          />
          {busy ? <ActivityIndicator size="small" color="#8B8880" /> : null}
          {query.length > 0 && !busy ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('a11y.clear')}>
              <Ionicons name="close-circle" size={16} color="#8B8880" />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={results}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              className="flex-row gap-3 rounded-2xl border border-border-light bg-panel-light p-3 active:opacity-80 dark:border-border-dark dark:bg-panel-dark"
            >
              <Avatar
                name={item.sender?.display_name ?? '?'}
                uri={item.sender?.avatar_url ?? null}
                size="xs"
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className="flex-1 text-[13px] font-semibold text-text-light dark:text-text-dark"
                    numberOfLines={1}
                  >
                    {item.sender?.display_name ?? t('input.aMessage')}
                  </Text>
                  <Text className="font-mono text-[9px] uppercase text-muted-light">
                    {formatRelativeTime(item.created_at)}
                  </Text>
                </View>
                <Text
                  className="text-[14px] leading-snug text-ink2-light dark:text-ink2-dark"
                  numberOfLines={2}
                >
                  {item.text}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            // Three states, not two: nothing typed yet is not the same
            // as searched-and-found-nothing, and saying "no results"
            // before anyone has searched is just wrong.
            !query.trim() ? (
              <EmptyState emoji="🔍" title={t('room.searchPrompt')} />
            ) : ran && !busy ? (
              <EmptyState
                emoji="🕵️"
                title={t('room.searchNoResults')}
                description={t('room.searchNoResultsHint')}
              />
            ) : null
          }
        />
      </View>
    </BottomSheet>
  );
}
