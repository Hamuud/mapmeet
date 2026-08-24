import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
// NativeWind's useColorScheme — respects `setColorScheme` from the
// theme preference; RN's builtin only reads the OS setting and would
// ignore the user's Light/Dark/Auto toggle in Settings.
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RestrictionDialog } from '@/features/moderation/RestrictionDialog';
import { useEventsBootstrap } from '@/features/events/useEventsBootstrap';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { useChatSync } from '@/hooks/useChatSync';
import { useNotifications } from '@/hooks/useNotifications';
import { useT } from '@/i18n';
import { usePresence } from '@/hooks/usePresence';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useModerationStore } from '@/store/moderation.store';
import { useSubscriptionStore } from '@/store/subscription.store';

/** Bottom tab bar — matches the redesigned mobile screen: light panel
 *  background, hairline top border, ink active state, muted inactive
 *  state, 64pt content height. Four tabs: Map · Events · Chat · You. */
export default function TabsLayout() {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isDark = scheme === 'dark';
  const unreadTotal = useChatStore((s) => s.unreadTotal);

  useEventsBootstrap();
  useChatSync();
  useCalendarSync();
  useNotifications();
  usePresence();

  // Load the viewer's mute/ban standing once per authed session so the
  // restriction dialog can explain a block without a round trip.
  const refreshModeration = useModerationStore((s) => s.refresh);
  useEffect(() => {
    if (session) void refreshModeration();
  }, [session, refreshModeration]);

  // Bind the store SDK to this account and reconcile the entitlement
  // with RevenueCat. Done on every authed launch on purpose: it is what
  // repairs a webhook that never arrived, and the person it repairs it
  // for is a paying customer who would otherwise have to write in.
  const bootstrapSubscription = useSubscriptionStore((s) => s.bootstrap);
  useEffect(() => {
    if (session) void bootstrapSubscription(session.user.id);
  }, [session, bootstrapSubscription]);

  if (status !== 'ready') return <LoadingSpinner fullScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  // An account created through Google has a handle we invented for it.
  // Ask once, here rather than at the call site, so every route into the
  // app goes through it — including a deep link straight to a chat.
  // `profile === null` means it is still loading, not that it is
  // unfinished; redirecting then would flash the screen at everyone.
  if (profile && !profile.onboarding_complete) {
    return <Redirect href="/(auth)/welcome" />;
  }
  // Then: how old are they? Asked once, of everybody — accounts made
  // before this shipped have never been asked, and Google never asks.
  // Unlike the handle above, this one has no skip.
  if (profile && !profile.age_confirmed) {
    return <Redirect href="/(auth)/age" />;
  }

  return (
    <>
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
          title: t('tabs.map'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('tabs.events'),
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
          title: t('tabs.chat'),
          // Unread count across every chat the viewer belongs to.
          tabBarBadge:
            unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#FE5800',
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
          title: t('tabs.you'),
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

    {/* Explains a mute/ban whenever a restricted action is attempted. */}
    <RestrictionDialog />
    </>
  );
}
