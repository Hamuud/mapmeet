// Must run before any `react-native-reanimated` import — sets a global the
// web build reads during module init. See reanimated-bootstrap.ts.
import '@/reanimated-bootstrap';
import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/Toast';
import { useDeepLinkSession } from '@/features/auth/useDeepLinkSession';
import { useAuthStore } from '@/store/auth.store';

export default function RootLayout() {
  const scheme = useColorScheme() ?? 'light';
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useDeepLinkSession();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: scheme === 'dark' ? '#0B0B0F' : '#FFFFFF',
              },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="profile-edit" />
          </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
