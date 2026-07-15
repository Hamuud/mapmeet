// Must run before any `react-native-reanimated` import — sets a global the
// web build reads during module init. See reanimated-bootstrap.ts.
import '@/reanimated-bootstrap';
import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNwColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/Toast';
import { useDeepLinkSession } from '@/features/auth/useDeepLinkSession';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useDeepLinkSession();

  // Read the persisted theme choice and drive NativeWind's color scheme
  // from it. `appearance` is loaded from AsyncStorage before first
  // paint (zustand-persist hydration), so the user sees their saved
  // theme on cold launch without a flash.
  const appearance = usePreferencesStore((s) => s.appearance);
  const { setColorScheme, colorScheme } = useNwColorScheme();
  useEffect(() => {
    // 'auto' maps to 'system' — NativeWind then follows the OS setting;
    // otherwise pin to the explicit choice. This runs whenever the
    // Settings toggle changes, so the theme flips instantly.
    setColorScheme(appearance === 'auto' ? 'system' : appearance);
  }, [appearance, setColorScheme]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const effective = colorScheme ?? 'light';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: effective === 'dark' ? '#0B0B0F' : '#FFFFFF',
              },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="profile-edit" />
            <Stack.Screen name="user/[id]" />
          </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
