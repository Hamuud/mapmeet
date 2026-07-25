import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Build a redirect URL back into the app for the auth email links
 *  (confirm signup, password reset).
 *
 *  On web this must preserve the `/mapmeet` base path the GitHub Pages
 *  deploy is served under — sending people to the bare origin lands them
 *  on `hamuud.github.io/…`, which isn't a Pages site (the 404). In local
 *  dev the app is served at the root, so the base is empty. On native we
 *  deep-link via the `mapmeet://` scheme instead.
 *
 *  NOTE: Supabase only honors these if the URL matches the project's
 *  redirect allow list (Auth → URL Configuration). Add
 *  `https://hamuud.github.io/mapmeet/**` there, or Supabase falls back to
 *  the Site URL. */
function appRedirect(pathname: string, query?: Record<string, string>): string {
  if (Platform.OS !== 'web') {
    return Linking.createURL(pathname, query ? { queryParams: query } : undefined);
  }
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  if (typeof window !== 'undefined' && window.location) {
    const { origin, pathname: loc } = window.location;
    const base = loc.startsWith('/mapmeet') ? '/mapmeet' : '';
    return `${origin}${base}${pathname}${qs}`;
  }
  return `https://hamuud.github.io/mapmeet${pathname}${qs}`;
}

export type SignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

/** Wraps supabase.auth. Every method returns the raw payload on success and
 *  throws on failure — screens catch and surface the message via <Toast />. */
export const authService = {
  async signUp({
    email,
    password,
    username,
    displayName,
  }: SignUpInput): Promise<{ user: User | null; session: Session | null }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Values here flow into raw_user_meta_data and are picked up by the
        // handle_new_user() trigger to seed the profiles row.
        data: { username, display_name: displayName },
        // After the user clicks the confirm-email link, Supabase sends them
        // here — the login screen, which shows a "confirmed, you can sign
        // in" banner when it sees `?confirmed=1`.
        emailRedirectTo: appRedirect('/login', { confirmed: '1' }),
      },
    });
    if (error) throw error;
    return data;
  },

  async signIn({ email, password }: SignInInput): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.session) throw new Error('No session returned from sign-in.');
    return data.session;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appRedirect('/reset'),
    });
    if (error) throw error;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /** Kick off phone-number verification by asking Supabase to attach a
   *  new phone to the current user. Supabase's SMS provider (Twilio /
   *  MessageBird / Vonage) sends a 6-digit code to `phone`; the user
   *  then confirms it via `verifyPhoneOtp` below. Requires the SMS
   *  provider to be enabled in Supabase → Auth → Providers → Phone. */
  async requestPhoneOtp(phone: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) throw error;
  },

  /** Confirm the 6-digit OTP the user typed back into the app. On
   *  success Supabase writes `auth.users.phone` + `phone_confirmed_at`,
   *  and the auth-state listener refetches the profile so the UI
   *  reflects the verified number. */
  async verifyPhoneOtp(phone: string, token: string): Promise<Session> {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'phone_change',
    });
    if (error) throw error;
    if (!data.session) throw new Error('No session returned after phone verification.');
    return data.session;
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback: (session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => callback(session));
  },
};
