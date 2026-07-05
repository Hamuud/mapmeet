import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Placeholder screen for the Chat tab. The redesign calls for
 *  per-event group chats — a real feature that needs its own schema
 *  (chats + messages tables + realtime subscription) and a full UI.
 *  This stub keeps the 4-tab nav coherent until that work lands. */
export default function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-100">
          <Ionicons name="chatbubbles" size={28} color="#4B5FE0" />
        </View>
        <Text className="font-display text-4xl text-text-light dark:text-text-dark">
          Chat is coming
        </Text>
        <Text className="max-w-xs text-center text-sm text-muted-light">
          Per-event group chats. Message hosts, ping attendees, share plans —
          all in one place. Landing after we ship v1 events.
        </Text>
      </View>
    </SafeAreaView>
  );
}
