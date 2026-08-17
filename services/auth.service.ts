import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
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
  /** 'YYYY-MM-DD'. Carried into user metadata so the age screen can
   *  submit it instead of asking again — see the comment in signUp. */
  dateOfBirth: string;
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
    dateOfBirth,
  }: SignUpInput): Promise<{ user: User | null; session: Session | null }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Values here flow into raw_user_meta_data and are picked up by the
        // handle_new_user() trigger to seed the profiles row.
        //
        // date_of_birth rides along but is NOT trusted: it is only a
        // convenience so the age screen can submit itself instead of
        // asking a question the person just answered. The real record is
        // written by set_date_of_birth(), which enforces the floor —
        // signup returns no session when email confirmation is on, so
        // this is the only way to carry the answer across.
        data: { username, display_name: displayName, date_of_birth: dateOfBirth },
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

  /** Sign in (or sign up — Supabase makes no distinction for OAuth)
   *  with Google.
   *
   *  Two shapes, because the platforms genuinely differ:
   *
   *  · Web navigates away to Google and comes back to the same origin
   *    with `?code=`. supabase-js picks that up itself via
   *    detectSessionInUrl, so this resolves to null and the page reloads
   *    signed in — there is nothing for the caller to await.
   *
   *  · Native opens an in-app browser tab (SFSafariViewController /
   *    Custom Tab) and waits for the redirect back into `mapmeet://`.
   *    `skipBrowserRedirect` stops supabase-js trying to navigate a
   *    window that doesn't exist. We then trade the code for a session
   *    ourselves.
   *
   *  Returns the session on native, null on web (where the redirect
   *  ends this JS context), and null if the user dismisses the sheet. */
  async signInWithGoogle(): Promise<Session | null> {
    const redirectTo = appRedirect('/auth-callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== 'web',
        queryParams: {
          // Ask for a refresh token and force the account chooser, so a
          // shared device doesn't silently sign in as whoever went last.
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
    if (Platform.OS === 'web') return null; // the browser is already leaving
    if (!data?.url) throw new Error('Google sign-in did not return a URL.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // 'cancel' (swiped away) and 'dismiss' (system closed it) are both
    // the user changing their mind — not an error to shout about.
    if (result.type !== 'success') return null;

    const code = new URL(result.url).searchParams.get('code');
    if (!code) {
      // Supabase puts the reason in the fragment when consent fails.
      const err = new URL(result.url).searchParams.get('error_description');
      throw new Error(err ?? 'Google sign-in did not return a code.');
    }

    const { data: session, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (!session.session) throw new Error('No session returned from Google sign-in.');
    return session.session;
  },

  /** Set the handle and name for an account created through OAuth, and
   *  mark the signup finished. Throws a bare code the screen maps to a
   *  translated message. */
  async completeOnboarding(username: string, displayName: string): Promise<void> {
    const { error } = await supabase.rpc('complete_onboarding', {
      p_username: username,
      p_display_name: displayName,
    });
    if (error) throw new Error(error.message);
  },

  /** Live check for the onboarding screen — is this handle free? */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('username_available', {
      p_username: username,
    });
    if (error) return false;
    return !!data;
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
