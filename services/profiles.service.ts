import { supabase } from './supabase';
import type { Profile } from '@/types';

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
