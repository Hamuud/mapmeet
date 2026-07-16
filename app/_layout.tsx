// Must run before any `react-native-reanimated` import — sets a global the
// web build reads during module init. See reanimated-bootstrap.ts.
import '@/reanimated-bootstrap';
import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNwColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { useColorScheme as useOsColorScheme } from 'react-native';
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

  // Auto → resolve to the current OS scheme HERE, then push a concrete
  // 'light' | 'dark' to NativeWind. Passing 'system' looks correct but
  // doesn't stamp the `.dark` class under Tailwind's `darkMode: 'class'`
  // config, so dark: variants never activate and the app stays
  // visually light while `useColorScheme()` still reports the OS's
  // actual value — that mismatch is why chrome icons were white on a
  // light background whenever OS was dark and Auto was picked. Reading
  // the OS via `react-native`'s `useColorScheme` also gets us live
  // updates when the user flips their OS theme mid-session.
  const osScheme = useOsColorScheme() ?? 'light';
  const effective = appearance === 'auto' ? osScheme : appearance;
  useEffect(() => {
    setColorScheme(effective);
  }, [effective, setColorScheme]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Silence unused-import warning: nativewind's `colorScheme` is still
  // useful for asserting the store/hook agreed after `setColorScheme`
  // ran, but we don't need it here — StatusBar + Stack background key
  // off `effective` computed above, which is the source of truth.
  void colorScheme;

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
            <Stack.Screen name="chat/[id]" />
          </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
