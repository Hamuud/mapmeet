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

/** profiles.role. Mirrors the `profiles_role_check` constraint.
 *
 *  Not a hierarchy: 'premium' is a paid cosmetic tier that sits off to
 *  the side of the staff chain (support → admin → owner). Anything that
 *  means "can moderate" must test membership explicitly — see
 *  `isStaffRole` in utils/roles.ts. */
/** One row from the guest-facing event RPCs. Flat rather than embedded,
 *  because a SECURITY DEFINER function returns a table and PostgREST
 *  embeds are not available to it — the creator's public fields are
 *  joined in as `creator_*` and reassembled client-side. */
export type PublicEventRpcRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  emoji: string;
  latitude: number;
  longitude: number;
  address: string | null;
  event_date: string;
  event_time: string;
  max_participants: number | null;
  visibility: string;
  tags: string[];
  source: string;
  source_url: string | null;
  image_url: string | null;
  geo_precision: string | null;
  pin_color: string | null;
  pin_effect: string | null;
  pin_effect_emoji: string[] | null;
  created_at: string;
  updated_at: string;
  creator_username: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  creator_role: string | null;
  participant_count: number;
  repeat_every: 'weekly' | 'fortnightly' | 'monthly' | null;
  next_date: string | null;
};

export type UserRole =
  | 'user'
  | 'premium'
  | 'designer'
  | 'support'
  | 'admin'
  | 'owner';

/** The fixed palette offered to premium accounts. Stored as keys, not
 *  hex, so the palette can be re-tuned without rewriting rows — and so
 *  nobody can pick a colour that reads as "selected" or "the pin you are
 *  placing". */
export type PinPaletteColor =
  | 'rose'
  | 'amber'
  | 'lime'
  | 'teal'
  | 'sky'
  | 'indigo'
  | 'violet'
  | 'magenta';

/** What actually sits in events.pin_color: a palette key, or a literal
 *  '#RRGGBB' from a designer. The `string & {}` keeps autocomplete on
 *  the eight keys while still accepting free hex. Which of the two an
 *  account may store is enforced by `enforce_pin_style()`, not by the
 *  CHECK — the constraint cannot see who is writing.
 *  Mirrors `events_pin_color_check`. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type PinColor = PinPaletteColor | (string & {});

/** Mirrors `events_pin_effect_check`. */
export type PinEffect = 'none' | 'glow' | 'stars' | 'shine';

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
           *  mirrors `role in ('support','admin','owner')`. Deliberately
           *  NOT `role <> 'user'`: 'premium' is a paid cosmetic tier, not
           *  a staff one. */
          is_admin: boolean;
          /** Account tier. Staff are support/admin/owner; 'premium' sits
           *  outside that chain and only unlocks styled event pins. Only
           *  the owner may assign staff roles; admins may grant premium. */
          role: UserRole;
          /** Notification settings the server needs while the app is
           *  closed — a cron job cannot read AsyncStorage. Written only
           *  through sync_push_settings(). */
          locale: 'en' | 'uk';
          /** Minutes east of UTC, as the device reported it. */
          tz_offset_minutes: number;
          push_chat: boolean;
          push_joins: boolean;
          push_events: boolean;
          push_social: boolean;
          push_digest: boolean;
          /** Anchor for "your area" in the digest — the last position the
           *  app actually had. Null until location is granted. */
          digest_lat: number | null;
          digest_lng: number | null;
          digest_radius_km: number;
          digest_last_sent_at: string | null;
          /** False only while an OAuth account still carries the handle
           *  the signup trigger invented for it — the app shows the
           *  finish-setup screen once, then this flips. */
          onboarding_complete: boolean;
          /** True once the viewer has given a date of birth. The date
           *  itself lives in `user_ages`, which only its owner can read —
           *  this table is world-readable, so a birthday can't sit here. */
          age_confirmed: boolean;
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
          /** Palette key for a styled pin, or null for the standard one.
           *  Only creators with `can_style_pin` can set it; the DB trigger
           *  drops it otherwise. */
          pin_color: PinColor | null;
          pin_effect: PinEffect | null;
          /** Falling particles for the 'stars' effect, designer-only.
           *  Up to three; null means the default ✦ sparkle. An array, not
           *  a packed string — emoji are grapheme clusters and splitting
           *  them apart in JS mangles ZWJ sequences. */
          pin_effect_emoji: string[] | null;
          /** Set when this event is one occurrence of a repeating
           *  series. Cleared when the series stops, so a non-null value
           *  means "this still repeats". */
          series_id: string | null;
          /** Denormalised from event_series so attendees can see that an
           *  event repeats — the series row itself is host-only. */
          repeat_every: 'weekly' | 'fortnightly' | 'monthly' | null;
          /** When the following occurrence lands, computed from the
           *  series anchor. Null when it does not repeat, or the host
           *  has stopped it. */
          next_date: string | null;
          /** One-shot flag for the "starts in an hour" push. */
          reminder_sent: boolean;
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
          pin_color?: PinColor | null;
          pin_effect?: PinEffect | null;
          pin_effect_emoji?: string[] | null;
          series_id?: string | null;
          repeat_every?: 'weekly' | 'fortnightly' | 'monthly' | null;
          next_date?: string | null;
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
      /** Private bookmarks. Owner-only in both directions — see
       *  20260821000000_saved_events.sql. */
      saved_events: {
        Row: {
          user_id: string;
          event_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          event_id: string;
        };
        /** Nothing in a row to change: unsave and save again. */
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Dates of birth, owner-readable only and written solely through
       *  set_date_of_birth(). No Insert/Update shape on purpose — a
       *  client that tries a direct write should fail to compile before
       *  it fails at the policy. */
      user_ages: {
        Row: {
          user_id: string;
          date_of_birth: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
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
      /** Premium: turn an event the caller hosts into the first of a
       *  repeating series, and generate the horizon. Returns the series
       *  id; idempotent if it already repeats. */
      set_event_repeat: {
        Args: { p_event: string; p_repeat: 'weekly' | 'fortnightly' | 'monthly' };
        Returns: string;
      };
      /** Stop a series: future occurrences are deleted (except the one
       *  the host originally created) and survivors are unlinked.
       *  Returns how many were removed. */
      stop_event_repeat: { Args: { p_series: string }; Returns: number };
      can_repeat_events: { Args: { p_user?: string }; Returns: boolean };
      /** What a signed-out visitor may read. `events` is closed to
       *  `anon` by RLS; these return a curated projection of public
       *  events plus an attendee COUNT — never the participant rows the
       *  count is derived from. */
      public_user_events: {
        Args: Record<string, never>;
        Returns: PublicEventRpcRow[];
      };
      public_events_in_bbox: {
        Args: {
          p_min_lat: number;
          p_max_lat: number;
          p_min_lng: number;
          p_max_lng: number;
          p_limit?: number;
        };
        Returns: PublicEventRpcRow[];
      };
      /** The caller's own subscription, for the account screen. No rows
       *  when signed out or never subscribed. */
      my_subscription: {
        Args: Record<string, never>;
        Returns: {
          active: boolean;
          status: string;
          store: string | null;
          product_id: string | null;
          entitled_until: string | null;
          will_renew: boolean;
        }[];
      };
      /** Is this account currently paying? Time-based, so a missed
       *  webhook lapses rather than granting forever. */
      has_active_subscription: {
        Args: { p_user?: string };
        Returns: boolean;
      };
      /** How many complaints the caller may still file in the current
       *  rolling 24h. `max_per_day` null means unlimited (staff). */
      my_report_quota: {
        Args: Record<string, never>;
        Returns: {
          used: number;
          max_per_day: number | null;
          resets_at: string | null;
        }[];
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
          /** The reported event's current tags. Null for every other
           *  kind of report — which is how the queue tells "not an
           *  event" apart from "an event with no tags". */
          target_event_tags: string[] | null;
        }[];
      };
      /** Strip rule-breaking tags off an event. Returns what remains;
       *  an event always keeps at least one, so removing the last
       *  leaves 'general'. */
      admin_remove_event_tags: {
        Args: { p_event: string; p_tags: string[]; p_report?: string | null };
        Returns: string[];
      };
      /** Remove a reported event outright. Resolves every open report
       *  about it and returns how many that was. */
      admin_delete_event: {
        Args: { p_event: string; p_report?: string | null; p_note?: string | null };
        Returns: number;
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
          role: UserRole;
          is_owner: boolean;
        }[];
      };
      is_owner: { Args: { p_user?: string }; Returns: boolean };
      complete_onboarding: {
        Args: { p_username: string; p_display_name: string };
        Returns: undefined;
      };
      username_available: { Args: { p_username: string }; Returns: boolean };
      sync_push_settings: {
        Args: {
          p_locale?: string | null;
          p_tz_offset?: number | null;
          p_chat?: boolean | null;
          p_joins?: boolean | null;
          p_events?: boolean | null;
          p_social?: boolean | null;
          p_digest?: boolean | null;
          p_lat?: number | null;
          p_lng?: number | null;
          p_radius_km?: number | null;
        };
        Returns: undefined;
      };
      send_dm_invite: { Args: { p_recipient: string; p_token: string }; Returns: string };
      assign_role: { Args: { p_username: string; p_role: string }; Returns: undefined };
      list_staff: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: UserRole;
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
      delete_my_account: {
        Args: { p_reason: string; p_details?: string | null };
        Returns: undefined;
      };
      /** Writes the viewer's date of birth into `user_ages` and flips
       *  `profiles.age_confirmed`. Raises, with a message meant for the
       *  person reading it, on anyone under `min_signup_age()`. */
      set_date_of_birth: { Args: { p_dob: string }; Returns: undefined };
      /** The viewer's own age in whole years, or null if never given. */
      viewer_age: { Args: Record<string, never>; Returns: number | null };
      /** Mark the caller arrived; returns the arrival time. Idempotent. */
      check_in: { Args: { p_event_id: string }; Returns: string };
      /** The caller's own arrival time at an event, or null. */
      my_arrival: { Args: { p_event_id: string }; Returns: string | null };
      /** Attendees of an event, already filtered by each person's
       *  attending_visibility and by blocks, friends first. */
      event_attendees: {
        Args: { p_event_id: string; p_limit?: number };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: string;
          is_friend: boolean;
        }[];
      };
      /** How many markers the caller may still pin. `max_per_day` null
       *  means unlimited; `resets_at` is when the oldest marker in the
       *  rolling 24h window ages out. No rows when signed out. */
      my_event_quota: {
        Args: Record<string, never>;
        Returns: {
          used: number;
          max_per_day: number | null;
          resets_at: string | null;
        }[];
      };
      /** Handle search for the Friends screen. Returns the five public
       *  columns only — never the whole profile row. */
      search_profiles: {
        Args: { p_query: string };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: UserRole | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
