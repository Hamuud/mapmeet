import { supabase } from './supabase';

export type InvitePreview = {
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
};

export const invitesService = {
  /** Mint a 24h invite token for an event. Only the host or a
   *  participant can. Server enforces this — the check here is only
   *  the resulting error message. */
  async create(eventId: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_event_invite', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return data as string;
  },

  /** Read the event details for an invite link (no auth needed beyond
   *  the token itself — the token IS the credential). Returns null if
   *  the token is bogus. */
  async preview(token: string): Promise<InvitePreview | null> {
    const { data, error } = await supabase.rpc('get_event_invite', {
      p_token: token,
    });
    if (error) throw error;
    return ((data as InvitePreview[] | null) ?? [])[0] ?? null;
  },

  /** Accept an invite — joins the event. Returns the event id so the
   *  caller can route to the event's chat. */
  async accept(token: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_event_invite', {
      p_token: token,
    });
    if (error) throw error;
    return data as string;
  },

  /** Public share URL — where the invite lands when tapped. Mirrors
   *  the Expo Router route (`/invite/[token]`). Used by the share
   *  sheet so the same link works via any medium. */
  shareUrl(token: string): string {
    // Web deploy is under /mapmeet/ on GitHub Pages; native builds get
    // the same URL (deep links resolve via the app's scheme too).
    const base =
      typeof window !== 'undefined' && window.location
        ? `${window.location.origin}${
            window.location.pathname.startsWith('/mapmeet') ? '/mapmeet' : ''
          }`
        : 'https://hamuud.github.io/mapmeet';
    return `${base}/invite/${token}`;
  },
};
