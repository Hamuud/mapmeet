import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

/** Turns an auth deep link into a session on native.
 *
 *  Two shapes arrive here, and both have to work:
 *
 *  · `?code=…` — the PKCE flow, which is what every email link and the
 *    Google redirect use now. Traded for a session with
 *    exchangeCodeForSession; the verifier is already in local storage
 *    from whichever screen started the flow.
 *  · `#access_token=…&refresh_token=…` — the old implicit shape. Kept
 *    because links already sitting in someone's inbox were minted
 *    before the switch and would otherwise dead-end.
 *
 *  Web needs none of this: detectSessionInUrl reads window.location. */
export function useDeepLinkSession() {
  useEffect(() => {
    if (Platform.OS === 'web') return; // detectSessionInUrl handles it

    const handle = async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      // Supabase writes tokens into the URL fragment. expo-linking exposes
      // `queryParams` for both `?` and `#` in v7+.
      const params = (parsed.queryParams ?? {}) as Record<string, string>;
      const type = params.type;

      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) return;
        // A recovery link still lands on the password screen; anything
        // else (email confirmation, Google) goes to the app.
        router.replace(type === 'recovery' ? '/reset' : '/(tabs)/map');
        return;
      }

      const access = params.access_token;
      const refresh = params.refresh_token;
      if (!access || !refresh) return;

      const { error } = await supabase.auth.setSession({
        access_token: access,
        refresh_token: refresh,
      });
      if (error) return;

      if (type === 'recovery') {
        router.replace('/reset');
      } else {
        router.replace('/(tabs)/map');
      }
    };

    // Handle cold-start deep link.
    void Linking.getInitialURL().then(handle);
    // Handle warm-start deep links.
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handle(url);
    });
    return () => sub.remove();
  }, []);
}
