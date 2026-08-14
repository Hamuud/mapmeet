import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useT } from '@/i18n';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator | null;
  onClose: () => void;
};

/** What a finished event looks like when you tap it.
 *
 *  A past event has no venue worth showing and no time worth acting on:
 *  the pin is already off the map (`filterEvents` strips anything past
 *  its grace window), so sending the viewer to the map — which is what
 *  every list used to do — landed them on an empty view of a place they
 *  can no longer go. Directions to last Tuesday are not a feature.
 *
 *  So this is a recap, not a peek: the title, what it was about, who
 *  ran it and how many came. No address, no date badge, no route. */
export function PastEventSheet({ event, onClose }: Props) {
  const t = useT();
  const description = event?.description?.trim();
  const tags = Array.isArray(event?.tags) ? event.tags : [];

  return (
    <BottomSheet open={!!event} onClose={onClose} heightPct={0.7} autoHeight>
      {event ? (
        <View className="gap-4">
          {/* Emoji tile + title. The "Ended" chip carries the fact that
              this is history, which is why no date/time is needed. */}
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-elevated-light dark:bg-elevated-dark">
              <Text style={{ fontSize: 26 }}>{event.emoji}</Text>
            </View>
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-1.5 self-start rounded-full border border-border-light bg-panel-light px-2.5 py-1 dark:border-border-dark dark:bg-panel-dark">
                <Ionicons name="time-outline" size={11} color="#8B8880" />
                <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  {t('events.ended')}
                </Text>
              </View>
              <Text
                className="text-lg font-bold leading-tight text-text-light dark:text-text-dark"
                numberOfLines={3}
              >
                {event.title}
              </Text>
            </View>
          </View>

          {/* The description is the whole point of this sheet, so it gets
              the room — scrollable rather than clamped, since there is
              no action button below competing for space. */}
          <ScrollView
            style={{ maxHeight: 260 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {description ? (
              <Text className="text-sm leading-relaxed text-text-light dark:text-text-dark">
                {description}
              </Text>
            ) : (
              <Text className="text-sm italic text-muted-light dark:text-muted-dark">
                {t('past.noDescription')}
              </Text>
            )}
          </ScrollView>

          {tags.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {tags.map((tag) => (
                <View key={tag} className="rounded-full bg-brand-500/10 px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-brand-500">
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Who ran it, and how many turned up. Neither is a location
              nor a time, and both are what you actually want to remember
              about an event you went to. */}
          <View className="flex-row items-center gap-2 border-t border-border-light pt-3 dark:border-border-dark">
            <Avatar
              name={event.creator?.display_name ?? ''}
              uri={event.creator?.avatar_url ?? null}
              size="xs"
            />
            <Text
              className="flex-1 text-xs text-muted-light dark:text-muted-dark"
              numberOfLines={1}
            >
              {t('past.hostedBy', {
                name: event.creator?.display_name ?? t('card.unknownHost'),
              })}
            </Text>
            <Text className="text-xs font-semibold text-ink2-light dark:text-ink2-dark">
              {t('past.went', { count: event.participant_count })}
            </Text>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
