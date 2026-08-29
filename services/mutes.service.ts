import { supabase } from './supabase';

/** Which kind of room an id refers to. The three live in separate
 *  tables and share no id space, so a mute is only meaningful with its
 *  scope attached. */
export type MuteScope = 'event' | 'dm' | 'group';

/** A muted room, as `"<scope>:<id>"`. Rooms are looked up one at a time
 *  from screens that each know only their own id, so a flat set of keys
 *  beats three lists to search. */
export type MuteKey = string;

export const muteKey = (scope: MuteScope, targetId: string): MuteKey =>
  `${scope}:${targetId}`;

export const mutesService = {
  /** Every room this viewer has silenced.
   *
   *  Fetched whole rather than per room: it is a handful of rows even
   *  for a heavy user, and having the set to hand means the chat list
   *  can mark rows without a query each.
   *
   *  `user_id` is never sent — the column defaults to auth.uid() and RLS
   *  would reject anything else anyway.
   */
  async list(): Promise<Set<MuteKey>> {
    const { data, error } = await supabase
      .from('chat_mutes')
      .select('scope,target_id');
    if (error) throw error;
    return new Set(
      ((data ?? []) as { scope: MuteScope; target_id: string }[]).map((r) =>
        muteKey(r.scope, r.target_id),
      ),
    );
  },

  async mute(scope: MuteScope, targetId: string): Promise<void> {
    const { error } = await supabase
      .from('chat_mutes')
      // Muting something already muted is not an error, it is a no-op —
      // two devices can race the same toggle.
      .upsert({ scope, target_id: targetId }, { onConflict: 'user_id,scope,target_id' });
    if (error) throw error;
  },

  async unmute(scope: MuteScope, targetId: string): Promise<void> {
    const { error } = await supabase
      .from('chat_mutes')
      .delete()
      .eq('scope', scope)
      .eq('target_id', targetId);
    if (error) throw error;
  },

  async set(scope: MuteScope, targetId: string, muted: boolean): Promise<void> {
    return muted ? this.mute(scope, targetId) : this.unmute(scope, targetId);
  },
};
