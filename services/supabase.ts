import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // We surface the misconfiguration loudly rather than silently constructing a
  // broken client — every screen touches Supabase and a cryptic 401 later is
  // much harder to debug than a boot-time throw.
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env and fill in ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

// Web reuses localStorage (Supabase's built-in default); native uses
// AsyncStorage. Detached storage prevents the session from being wiped
// on app restart.
const storage =
  Platform.OS === 'web'
    ? undefined
    : {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE, not the implicit default. An OAuth redirect back into a
    // custom URL scheme can be intercepted by any other app that
    // registers `mapmeet://`; PKCE makes the intercepted code useless
    // without the verifier, which never leaves this device.
    //
    // It changes the email links too: confirm-signup and password-reset
    // now arrive as `?code=` instead of `#access_token=`, and the
    // verifier lives in this client's storage. Practical consequence —
    // a reset link must be opened on the device that requested it.
    // useDeepLinkSession handles both shapes.
    flowType: 'pkce',
    // Web parses the `?code=` on load itself; native does it in
    // useDeepLinkSession, because there is no window.location to read.
    detectSessionInUrl: Platform.OS === 'web',
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
});
