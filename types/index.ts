import type { Database } from './database';

export type { PollOption, PollPayload } from './database';

/** Client-side poll view state fetched via get_poll_details: the viewer's
 *  own choice (to highlight it) plus, for non-anonymous polls, the voter
 *  profiles per option id. */
export type PollDetails = {
  myOption: string | null;
  voters: Record<
    string,
    Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>[]
  > | null;
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];
export type Participant = Database['public']['Tables']['participants']['Row'];

export type EventInsert = Database['public']['Tables']['events']['Insert'];
export type EventUpdate = Database['public']['Tables']['events']['Update'];

/** An event enriched with its creator profile + derived participant count.
 *  This is the shape the UI actually renders. */
/** The slice of a profile embedded alongside events, messages, members
 *  and friends. `role` rides along so the UI can show the verified badge
 *  wherever a name appears; it's optional because older embeds (and
 *  locally-constructed stubs) may not carry it. */
export type ProfileRef = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url'
> & { role?: Profile['role'] };

export type EventWithCreator = Event & {
  creator: ProfileRef;
  participant_count: number;
  is_joined: boolean;
};

export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageInsert = Database['public']['Tables']['messages']['Insert'];

/** A message enriched with its sender profile — the shape the chat UI
 *  renders. `sender` is null for system messages. `read_at` is only set
 *  for DM messages (when the recipient first read it) — undefined
 *  elsewhere, where the bubble falls back to ✓/✓✓ ticks. */
/** A message enriched for rendering. DMs add two shapes the shared
 *  `messages` table doesn't have: an `invite` card and its token. */
export type MessageWithSender = Omit<Message, 'type'> & {
  type: Message['type'] | 'invite';
  sender: ProfileRef | null;
  read_at?: string | null;
  event_invite_token?: string | null;
};

export type LatLng = { latitude: number; longitude: number };

export type EventFilter =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'nearby'
  | 'joined'
  | 'created';
