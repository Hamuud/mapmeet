import { supabase } from './supabase';

export type RatingVote = -1 | 0 | 1;

export type RatingSummary = {
  likes: number;
  dislikes: number;
  /** The caller's own vote: 1 like, -1 dislike, 0 none. */
  myVote: RatingVote;
};

export type UserReview = {
  id: string;
  text: string;
  created_at: string;
};

/** Likes/dislikes + anonymous reviews. All calls go through
 *  security-definer RPCs — the underlying tables are not readable via
 *  PostgREST, which is what keeps review authorship anonymous. */
export const ratingsService = {
  async getSummary(userId: string): Promise<RatingSummary> {
    const { data, error } = await supabase.rpc('get_user_rating', {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = data?.[0];
    return {
      likes: Number(row?.likes ?? 0),
      dislikes: Number(row?.dislikes ?? 0),
      myVote: (row?.my_vote === 1 ? 1 : row?.my_vote === -1 ? -1 : 0) as RatingVote,
    };
  },

  /** Cast / change / withdraw (0) a vote on another user. */
  async rate(targetId: string, value: RatingVote): Promise<void> {
    const { error } = await supabase.rpc('rate_user', {
      p_target_id: targetId,
      p_value: value,
    });
    if (error) throw error;
  },

  async listReviews(userId: string): Promise<UserReview[]> {
    const { data, error } = await supabase.rpc('list_user_reviews', {
      p_user_id: userId,
    });
    if (error) throw error;
    return data ?? [];
  },

  /** Post (or replace — one per author per target) an anonymous review. */
  async addReview(targetId: string, text: string): Promise<void> {
    const { error } = await supabase.rpc('add_user_review', {
      p_target_id: targetId,
      p_text: text.trim(),
    });
    if (error) throw error;
  },
};
