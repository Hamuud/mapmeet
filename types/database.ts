// Hand-written mirror of the Supabase schema. Regenerate with
// `supabase gen types typescript --project-id <id> > types/database.ts`
// once the CLI is wired up; the shape below matches the initial migration.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          phone: string | null;
          interests: string[];
          push_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          interests?: string[];
          push_token?: string | null;
        };
        Update: {
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          interests?: string[];
          push_token?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string | null;
          emoji: string;
          latitude: number;
          longitude: number;
          address: string | null;
          event_date: string; // ISO date (YYYY-MM-DD)
          event_time: string; // ISO time (HH:MM:SS)
          max_participants: number | null;
          visibility: 'public' | 'private';
          tags: string[];
          archive_warned: boolean;
          /** 'user' = pinned in the app; anything else = imported by the
           *  ingest Edge Function from that source ('karabas', …). */
          source: string;
          /** External id (canonical URL) for imported events; null for user ones. */
          source_id: string | null;
          /** Ticket / event page link on the source site. */
          source_url: string | null;
          /** Poster image published by the source. */
          image_url: string | null;
          /** How precisely the venue resolved. 'city' events are kept off
           *  the map (a centroid pin would lie) but stay in Nearby. */
          geo_precision: 'venue' | 'city' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          creator_id: string;
          title: string;
          description?: string | null;
          emoji: string;
          latitude: number;
          longitude: number;
          address?: string | null;
          event_date: string;
          event_time: string;
          max_participants?: number | null;
          visibility?: 'public' | 'private';
          // Required at the type level so the compiler stops us from
          // shipping an event without at least one tag.
          tags: string[];
        };
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
        Relationships: [];
      };
      participants: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          event_id: string;
          sender_id: string | null; // null = system
          type: 'text' | 'image' | 'video' | 'location' | 'audio' | 'system';
          text: string | null;
          media_url: string | null;
          latitude: number | null;
          longitude: number | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          duration_ms: number | null;
          waveform: number[] | null;
          read_by: string[];
          deleted_for: string[];
          hidden: boolean;
          created_at: string;
        };
        Insert: {
          event_id: string;
          sender_id: string;
          type?: 'text' | 'image' | 'video' | 'location' | 'audio';
          text?: string | null;
          media_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          reply_to?: string | null;
          duration_ms?: number | null;
          waveform?: number[] | null;
        };
        // Mutations (read_by / deleted_for / hidden) go through RPCs —
        // there is no client-side UPDATE path.
        Update: Record<string, never>;
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          status: 'pending' | 'accepted';
          created_at: string;
          responded_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      dms: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      dm_messages: {
        Row: {
          id: string;
          dm_id: string;
          sender_id: string;
          type: 'text' | 'invite' | 'audio';
          text: string | null;
          event_invite_token: string | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          media_url: string | null;
          duration_ms: number | null;
          waveform: number[] | null;
          read_by: string[];
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      event_invites: {
        Row: {
          token: string;
          event_id: string;
          inviter_id: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      group_chats: {
        Row: {
          id: string;
          name: string;
          emoji: string;
          creator_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      group_members: {
        Row: { group_id: string; user_id: string; joined_at: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      group_messages: {
        Row: {
          id: string;
          group_id: string;
          sender_id: string | null;
          type: 'text' | 'audio' | 'system';
          text: string | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          media_url: string | null;
          duration_ms: number | null;
          waveform: number[] | null;
          read_by: string[];
          deleted_for: string[];
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      group_invites: {
        Row: {
          token: string;
          group_id: string;
          inviter_id: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    // supabase-js's GenericSchema needs Views / Functions / Enums keys
    // present or the whole schema degrades to `never` and every
    // .insert() / .rpc() call fails to type — that was the source of
    // the long-standing "not assignable to parameter of type 'never'"
    // errors in the services.
    Views: Record<string, never>;
    Functions: {
      mark_messages_read: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      delete_message_for_me: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      hide_message: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      remove_participant: {
        Args: { p_event_id: string; p_user_id: string };
        Returns: undefined;
      };
      toggle_reaction: {
        Args: { p_message_id: string; p_emoji: string };
        Returns: undefined;
      };
      post_archive_warning: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      rate_user: {
        Args: { p_target_id: string; p_value: number };
        Returns: undefined;
      };
      get_user_rating: {
        Args: { p_user_id: string };
        Returns: { likes: number; dislikes: number; my_vote: number }[];
      };
      add_user_review: {
        Args: { p_target_id: string; p_text: string };
        Returns: undefined;
      };
      list_user_reviews: {
        Args: { p_user_id: string };
        Returns: { id: string; text: string; created_at: string }[];
      };
      request_friendship: { Args: { p_target: string }; Returns: string };
      remove_friendship: { Args: { p_other: string }; Returns: undefined };
      get_or_create_dm: { Args: { p_other: string }; Returns: string };
      send_dm: {
        Args: { p_recipient: string; p_text: string; p_reply_to?: string | null };
        Returns: string;
      };
      send_dm_voice: {
        Args: {
          p_recipient: string;
          p_media_url: string;
          p_duration_ms: number;
          p_waveform: number[] | null;
          p_reply_to?: string | null;
        };
        Returns: string;
      };
      toggle_dm_reaction: { Args: { p_message_id: string; p_emoji: string }; Returns: undefined };
      mark_dm_read: { Args: { p_dm: string }; Returns: undefined };
      create_event_invite: { Args: { p_event_id: string }; Returns: string };
      get_event_invite: {
        Args: { p_token: string };
        Returns: {
          event_id: string;
          event_title: string;
          event_emoji: string;
          event_date: string;
          event_time: string;
          event_address: string | null;
          event_image_url: string | null;
          inviter_display_name: string;
          inviter_username: string;
          expires_at: string;
          expired: boolean;
        }[];
      };
      accept_event_invite: { Args: { p_token: string }; Returns: string };
      create_group: {
        Args: { p_name: string; p_emoji: string; p_member_ids: string[] };
        Returns: string;
      };
      add_group_members: {
        Args: { p_group: string; p_member_ids: string[] };
        Returns: undefined;
      };
      send_group_message: {
        Args: { p_group: string; p_text: string; p_reply_to?: string | null };
        Returns: string;
      };
      send_group_voice: {
        Args: {
          p_group: string;
          p_media_url: string;
          p_duration_ms: number;
          p_waveform: number[] | null;
          p_reply_to?: string | null;
        };
        Returns: string;
      };
      toggle_group_reaction: {
        Args: { p_message_id: string; p_emoji: string };
        Returns: undefined;
      };
      mark_group_read: { Args: { p_group: string }; Returns: undefined };
      leave_group: { Args: { p_group: string }; Returns: undefined };
      create_group_invite: { Args: { p_group: string }; Returns: string };
      get_group_invite: {
        Args: { p_token: string };
        Returns: {
          group_id: string;
          group_name: string;
          group_emoji: string;
          member_count: number;
          inviter_display_name: string;
          inviter_username: string;
          expires_at: string;
          expired: boolean;
        }[];
      };
      accept_group_invite: { Args: { p_token: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
