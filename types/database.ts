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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
