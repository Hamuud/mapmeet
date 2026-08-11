import { storageService } from './storage.service';
import { supabase } from './supabase';

/** Why someone is leaving. Stored as the key; the label is a dictionary
 *  entry so it reads in the user's language, while the reason that
 *  reaches the feedback inbox stays a stable English code. */
export const DELETE_REASONS = [
  'not_useful',
  'too_few_events',
  'privacy',
  'bad_experience',
  'taking_a_break',
  'other',
] as const;

export type DeleteReason = (typeof DELETE_REASONS)[number];

export const accountService = {
  /** Permanently delete the signed-in account.
   *
   *  Three steps, in this order for a reason:
   *
   *   1. Re-check the password by signing in with it. Supabase has no
   *      "verify password" endpoint, and this is the standard substitute
   *      — same user, so the worst it does is refresh the session.
   *   2. Delete the avatar through the Storage API. SQL can't touch
   *      storage.objects (storage.protect_delete), so the RPC can't do
   *      it. Doing it first means a failed RPC leaves a re-uploadable
   *      gap rather than an orphaned photo of someone's face.
   *   3. Call the RPC, which files the reason as feedback and then
   *      deletes the auth user, cascading everything else.
   *
   *  Throws with a message the UI shows verbatim. */
  async deleteAccount(input: {
    email: string;
    password: string;
    userId: string;
    reason: DeleteReason;
    details?: string | null;
  }): Promise<void> {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (authError) throw new Error('account.wrongPassword');

    await storageService.removeAvatars(input.userId);

    const { error } = await supabase.rpc('delete_my_account', {
      p_reason: input.reason,
      p_details: input.details?.trim() ? input.details.trim() : null,
    });
    if (error) throw error;
  },
};
