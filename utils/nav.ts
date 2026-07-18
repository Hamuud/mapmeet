import { router, type Href } from 'expo-router';

/** Back that can't strand anyone.
 *
 *  A screen reached by URL refresh or a shared link has no navigation
 *  history, and `router.back()` silently does nothing — which left
 *  deep-linked pages (user profiles, chats) with a dead back chevron
 *  and no tab bar to escape through: the app looked frozen. When
 *  there's nothing to pop, land on the given tab instead. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
