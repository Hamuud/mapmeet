import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
// NativeWind's useColorScheme — respects `setColorScheme` from the
// theme preference; RN's builtin only reads the OS setting and would
// ignore the user's Light/Dark/Auto toggle in Settings.
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useEventsBootstrap } from '@/features/events/useEventsBootstrap';
import { useChatSync } from '@/hooks/useChatSync';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';

/** Bottom tab bar — matches the redesigned mobile screen: light panel
 *  background, hairline top border, ink active state, muted inactive
 *  state, 64pt content height. Four tabs: Map · Events · Chat · You. */
export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isDark = scheme === 'dark';
  const unreadTotal = useChatStore((s) => s.unreadTotal);

  useEventsBootstrap();
  useChatSync();
  useNotifications();

  if (status !== 'ready') return <LoadingSpinner fullScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? '#F5F5F2' : '#0E0E10',
        tabBarInactiveTintColor: isDark ? '#8A8A94' : '#8B8880',
        tabBarStyle: {
          backgroundColor: isDark ? '#16161C' : '#FDFCF8',
          borderTopColor: isDark ? '#2A2A32' : '#E4E1D8',
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          // Grow the tab bar by the device's bottom inset so the labels
          // sit above the home indicator instead of on top of it.
          // Setting `height` explicitly means RN doesn't add the safe
          // area for us — we have to fold it in ourselves.
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          // Unread count across every chat the viewer belongs to.
          tabBarBadge:
            unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#E68A5E',
            color: '#fff',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
