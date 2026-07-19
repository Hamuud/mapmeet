import { supabase } from './supabase';

/** Friendship state between the viewer and a target user, from the
 *  viewer's point of view. UI branches on this: "Add friend" vs
 *  "Accept" vs "Friends" vs "Requested". */
export type FriendshipState =
  | 'none'
  | 'incoming' // they requested you
  | 'outgoing' // you requested them
  | 'friends';

export type FriendRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  responded_at: string | null;
  // Joined "other" profile, resolved on the client from the row's ids.
  other: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
};

type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

/** Read the raw edge (if any) between viewer and target. Small enough
 *  that we always fetch fresh — never worth caching a boolean. */
export async function getFriendshipState(
  viewerId: string,
  targetId: string,
): Promise<FriendshipState> {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, recipient_id, status')
    .or(
      `and(requester_id.eq.${viewerId},recipient_id.eq.${targetId}),and(requester_id.eq.${targetId},recipient_id.eq.${viewerId})`,
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'none';
  if (data.status === 'accepted') return 'friends';
  return data.requester_id === viewerId ? 'outgoing' : 'incoming';
}

export const friendshipsService = {
  getState: getFriendshipState,

  /** Send a friend request. If the other side already requested you,
   *  the RPC auto-accepts — one click accepts a pending inbound. */
  async request(targetId: string): Promise<void> {
    const { error } = await supabase.rpc('request_friendship', {
      p_target: targetId,
    });
    if (error) throw error;
  },

  async remove(otherId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_friendship', {
      p_other: otherId,
    });
    if (error) throw error;
  },

  /** Everyone I'm mutually friends with — for the Friends screen. */
  async listFriends(viewerId: string): Promise<FriendRow[]> {
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `*,
         requester:requester_id (id, username, display_name, avatar_url),
         recipient:recipient_id (id, username, display_name, avatar_url)`,
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => {
      const requester = row.requester as ProfileLite;
      const recipient = row.recipient as ProfileLite;
      return {
        id: row.id as string,
        requester_id: row.requester_id as string,
        recipient_id: row.recipient_id as string,
        status: row.status as 'pending' | 'accepted',
        created_at: row.created_at as string,
        responded_at: row.responded_at as string | null,
        other: row.requester_id === viewerId ? recipient : requester,
      };
    });
  },

  /** Pending requests inbound to the viewer — the "Requests" segment. */
  async listPendingIncoming(viewerId: string): Promise<FriendRow[]> {
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `*, requester:requester_id (id, username, display_name, avatar_url)`,
      )
      .eq('status', 'pending')
      .eq('recipient_id', viewerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      requester_id: row.requester_id as string,
      recipient_id: row.recipient_id as string,
      status: row.status as 'pending' | 'accepted',
      created_at: row.created_at as string,
      responded_at: row.responded_at as string | null,
      other: row.requester as ProfileLite,
    }));
  },
};
