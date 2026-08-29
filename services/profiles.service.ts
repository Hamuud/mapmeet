import { supabase } from './supabase';
import type { Profile } from '@/types';
import type { UserRole } from '@/types/database';

/** Whether the URL segment looks like a UUID rather than a username.
 *  Usernames are `[a-zA-Z0-9_\.]{3,24}` (init migration), so a 36-char
 *  hyphenated hex string can only be a legacy id-shaped URL. */
export function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** What anyone is allowed to see of a stranger: enough to recognise them
 *  in a list and open their profile, and nothing else. Matches the
 *  columns `search_profiles` returns — deliberately not `Profile`, so
 *  that a screen rendering search results cannot reach for a field the
 *  search never fetched. */
export type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole | null;
};

export const profilesService = {
  /** Set who can see the events you're attending: nobody / friends /
   *  everyone. Updates your own profile row. */
  async setAttendingVisibility(
    value: 'nobody' | 'friends' | 'everyone',
  ): Promise<void> {
    const { error } = await supabase.rpc('set_attending_visibility', {
      p_value: value,
    });
    if (error) throw error;
  },

  /** Heartbeat: mark the signed-in user active now (powers DM presence). */
  async touchLastSeen(): Promise<void> {
    const { error } = await supabase.rpc('touch_last_seen');
    if (error) throw error;
  },

  /** Just the last-seen timestamp for one user — cheap poll for the DM
   *  header without refetching the whole profile. */
  async getLastSeen(id: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('last_seen_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data?.last_seen_at ?? null;
  },

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Case-insensitive lookup — usernames stored as typed, but a share
   *  link with mixed case shouldn't 404. */
  async getByUsername(username: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', username)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Find people by handle, near misses included.
   *
   *  Goes through the `search_profiles` RPC rather than an `ilike` here,
   *  for two reasons. The ranking and the typo tolerance are trigram
   *  work that belongs in the database. And the RPC returns five public
   *  columns and only those — a `select('*')` search would hand back
   *  every column of every matching row, which for this table means
   *  home coordinates and a push token.
   *
   *  Returns at most 20, best match first. A blank query is not an
   *  error, it is an empty list. */
  async search(query: string): Promise<PublicProfile[]> {
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await supabase.rpc('search_profiles', { p_query: q });
    if (error) throw error;
    return (data as PublicProfile[] | null) ?? [];
  },

  /** Route-friendly resolver: takes whatever landed in `/user/[handle]`
   *  and picks the right lookup. Kept together with the two calls so a
   *  future auth-slug renaming touches one file. */
  async getByHandle(handle: string): Promise<Profile | null> {
    return looksLikeUuid(handle)
      ? this.getById(handle)
      : this.getByUsername(handle);
  },

  /** Record the viewer's date of birth ('YYYY-MM-DD').
   *
   *  Goes through an RPC rather than a table write for two reasons: the
   *  date lands in `user_ages`, which has no INSERT policy at all, and the
   *  minimum age is enforced there so the form's own check can't be the
   *  only thing standing in the way. The error message from the function
   *  is written for a person and is shown as-is. */
  async setDateOfBirth(dateOfBirth: string): Promise<void> {
    const { error } = await supabase.rpc('set_date_of_birth', {
      p_dob: dateOfBirth,
    });
    if (error) throw new Error(error.message);
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        Profile,
        'display_name' | 'username' | 'avatar_url' | 'bio' | 'phone' | 'interests'
      >
    >,
  ): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
