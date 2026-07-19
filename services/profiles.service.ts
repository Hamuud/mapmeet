import { supabase } from './supabase';
import type { Profile } from '@/types';

/** Whether the URL segment looks like a UUID rather than a username.
 *  Usernames are `[a-zA-Z0-9_\.]{3,24}` (init migration), so a 36-char
 *  hyphenated hex string can only be a legacy id-shaped URL. */
export function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export const profilesService = {
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

  /** Route-friendly resolver: takes whatever landed in `/user/[handle]`
   *  and picks the right lookup. Kept together with the two calls so a
   *  future auth-slug renaming touches one file. */
  async getByHandle(handle: string): Promise<Profile | null> {
    return looksLikeUuid(handle)
      ? this.getById(handle)
      : this.getByUsername(handle);
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
