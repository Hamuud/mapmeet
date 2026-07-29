// Hand-written mirror of the Supabase schema. Regenerate with
// `supabase gen types typescript --project-id <id> > types/database.ts`
// once the CLI is wired up; the shape below matches the initial migration.

/** Poll definition + live tallies carried on a `poll`-type message row.
 *  `votes` on each option is the aggregate count (identities live in the
 *  private poll_votes table — see the polls migration). */
export type PollOption = { id: string; text: string; votes: number };
export type PollPayload = {
  question: string;
  anonymous: boolean;
  options: PollOption[];
};

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
          /** Bumped by the client heartbeat while foregrounded — powers
           *  the DM "Online / last seen …" status. Null = never recorded. */
          last_seen_at: string | null;
          /** Who can see the events this user has joined (not hosted). */
          attending_visibility: 'nobody' | 'friends' | 'everyone';
          /** Grants the Complaints & reports (moderation) screen —
           *  mirrors `role <> 'user'`. */
          is_admin: boolean;
          /** Staff tier. Only 'owner' may assign roles. */
          role: 'user' | 'support' | 'admin' | 'owner';
          /** Set while serving a mute; null once it lapses or is lifted. */
          muted_until: string | null;
          banned_at: string | null;
          warning_count: number;
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
          attending_visibility?: 'nobody' | 'friends' | 'everyone';
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
          /** One-shot flag: the automatic "Who's coming?" poll was posted. */
          coming_poll_created: boolean;
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
          type: 'text' | 'image' | 'video' | 'location' | 'audio' | 'system' | 'poll';
          text: string | null;
          media_url: string | null;
          latitude: number | null;
          longitude: number | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          duration_ms: number | null;
          waveform: number[] | null;
          poll: PollPayload | null;
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
          sender_id: string | null;
          type: 'text' | 'invite' | 'audio' | 'poll' | 'system';
          text: string | null;
          event_invite_token: string | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          media_url: string | null;
          duration_ms: number | null;
          waveform: number[] | null;
          poll: PollPayload | null;
          read_by: string[];
          /** When the recipient first read this message (1:1 → unambiguous). */
          read_at: string | null;
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
          type: 'text' | 'audio' | 'system' | 'poll';
          text: string | null;
          reply_to: string | null;
          reactions: Record<string, string[]>;
          media_url: string | null;
          duration_ms: number | null;
          waveform: number[] | null;
          poll: PollPayload | null;
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
      touch_last_seen: { Args: Record<string, never>; Returns: undefined };
      is_admin: { Args: { p_user?: string }; Returns: boolean };
      submit_report: {
        Args: {
          p_target_type: 'user' | 'review' | 'event' | 'hashtag' | 'message';
          p_reasons: string[];
          p_target_user?: string | null;
          p_target_id?: string | null;
          p_target_text?: string | null;
          p_details?: string | null;
        };
        Returns: string;
      };
      admin_list_reports: {
        Args: { p_status?: string };
        Returns: {
          id: string;
          target_type: 'user' | 'review' | 'event' | 'hashtag' | 'message';
          target_id: string | null;
          target_text: string | null;
          reasons: string[];
          details: string | null;
          status: 'open' | 'resolved' | 'dismissed';
          created_at: string;
          reporter_username: string;
          reporter_display_name: string;
          target_user_id: string | null;
          target_username: string | null;
          target_display_name: string | null;
          target_avatar_url: string | null;
          target_banned: boolean | null;
          target_muted_until: string | null;
          target_warnings: number | null;
          target_report_count: number | null;
        }[];
      };
      admin_resolve_report: {
        Args: { p_report: string; p_status: string; p_note?: string | null };
        Returns: undefined;
      };
      admin_moderate_user: {
        Args: {
          p_user: string;
          p_action: 'warn' | 'mute' | 'unmute' | 'ban' | 'unban';
          p_minutes?: number | null;
          p_report?: string | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      admin_delete_review: { Args: { p_review: string }; Returns: undefined };
      my_moderation_state: {
        Args: Record<string, never>;
        Returns: {
          muted_until: string | null;
          banned: boolean;
          warnings: number;
          is_admin: boolean;
          role: 'user' | 'support' | 'admin' | 'owner';
          is_owner: boolean;
        }[];
      };
      is_owner: { Args: { p_user?: string }; Returns: boolean };
      send_dm_invite: { Args: { p_recipient: string; p_token: string }; Returns: string };
      assign_role: { Args: { p_username: string; p_role: string }; Returns: undefined };
      list_staff: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: 'user' | 'support' | 'admin' | 'owner';
        }[];
      };
      submit_feedback: {
        Args: {
          p_message: string;
          p_attachments?: { url: string; type: 'image' | 'video' }[];
          p_app_version?: string | null;
          p_platform?: string | null;
        };
        Returns: string;
      };
      set_attending_visibility: { Args: { p_value: string }; Returns: undefined };
      list_attending_event_ids: { Args: { p_target: string }; Returns: string[] };
      block_user: { Args: { p_target: string }; Returns: undefined };
      unblock_user: { Args: { p_target: string }; Returns: undefined };
      get_block_state: {
        Args: { p_other: string };
        Returns: { i_blocked: boolean; they_blocked: boolean }[];
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
      remove_group_member: {
        Args: { p_group: string; p_user: string };
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
      create_event_poll: {
        Args: {
          p_event_id: string;
          p_question: string;
          p_options: string[];
          p_anonymous?: boolean;
          p_reply_to?: string | null;
        };
        Returns: string;
      };
      create_group_poll: {
        Args: {
          p_group: string;
          p_question: string;
          p_options: string[];
          p_anonymous?: boolean;
          p_reply_to?: string | null;
        };
        Returns: string;
      };
      create_dm_poll: {
        Args: {
          p_dm: string;
          p_question: string;
          p_options: string[];
          p_anonymous?: boolean;
          p_reply_to?: string | null;
        };
        Returns: string;
      };
      ensure_coming_poll: { Args: { p_event_id: string }; Returns: undefined };
      vote_poll: { Args: { p_message_id: string; p_option_id: string }; Returns: undefined };
      get_poll_details: {
        Args: { p_message_ids: string[] };
        Returns: {
          message_id: string;
          my_option: string | null;
          voters: Record<
            string,
            { id: string; username: string; display_name: string; avatar_url: string | null }[]
          > | null;
        }[];
      };
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
