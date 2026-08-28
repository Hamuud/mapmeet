import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Monotonic suffix. Module-level, so every channel opened anywhere in
 *  the process gets a distinct topic whichever feature asked for it. */
let seq = 0;

/** Open a realtime channel on a topic that cannot collide with one the
 *  client is still tearing down.
 *
 *  `supabase.channel(topic)` does not always hand back a new channel: if
 *  one with that topic is still registered it returns the existing
 *  object. And `removeChannel()` unsubscribes asynchronously, so a
 *  channel outlives the cleanup that asked for its removal. Anything
 *  resubscribing inside that window gets the old, already-subscribed
 *  channel back — and adding a `postgres_changes` handler to a channel
 *  that has already subscribed throws outright:
 *
 *      cannot add `postgres_changes` callbacks for
 *      realtime:mapmeet:chat:badge after `subscribe()`.
 *
 *  That is what took the app down on sign-in. The router swaps (auth)
 *  for (tabs), the tabs layout remounts, and its cleanup and its setup
 *  run in the same frame — comfortably inside the window. The throw
 *  came out of the layout, above every screen-level boundary, so on
 *  iOS it ended the process rather than a screen.
 *
 *  Every channel in this app carries `postgres_changes` and nothing
 *  else, which makes the topic a local name and nothing more: no other
 *  client has to agree on it, so a unique one per open costs nothing.
 *  It would NOT be free for broadcast or presence, where the topic is
 *  the room itself and everyone has to name it the same — those would
 *  need the real name and a different fix. Worth remembering before
 *  routing one through here. */
export function openChannel(name: string): RealtimeChannel {
  seq += 1;
  return supabase.channel(`${name}#${seq}`);
}
