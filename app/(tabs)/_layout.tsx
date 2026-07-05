import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useEventsBootstrap } from '@/features/events/useEventsBootstrap';
import { useAuthStore } from '@/store/auth.store';

/** Bottom tab bar — matches the redesigned mobile screen: light panel
 *  background, hairline top border, ink active state, muted inactive
 *  state, 64pt content height. Four tabs: Map · Events · Chat · You. */
export default function TabsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isDark = scheme === 'dark';

  useEventsBootstrap();

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
          height: 64,
          paddingBottom: 8,
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
