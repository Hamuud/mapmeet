import { Redirect } from 'expo-router';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore } from '@/store/auth.store';

/** Where Google sends the browser back to.
 *
 *  Only the web build ever renders this. On native the redirect is
 *  consumed by `openAuthSessionAsync` inside the sheet and this route is
 *  never mounted — but the URL has to resolve to *something* on web, or
 *  expo-router shows its 404 for the second it takes supabase-js to
 *  read the `?code=` off window.location and swap it for a session.
 *
 *  So: hold a spinner until the auth bootstrap settles, then hand over
 *  to the index route, which already knows where a signed-in (or
 *  signed-out) person belongs. Nothing here parses the code itself —
 *  `detectSessionInUrl` does that during client init. */
export default function AuthCallback() {
  const status = useAuthStore((s) => s.status);
  if (status !== 'ready') return <LoadingSpinner fullScreen />;
  return <Redirect href="/" />;
}
