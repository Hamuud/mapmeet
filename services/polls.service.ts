import { supabase } from './supabase';
import type { PollDetails } from '@/types';

/** Polls live on messages in both event and group chats. Creation is
 *  per-chat (different owning tables); voting + detail lookup are generic
 *  — the RPCs locate the poll by its globally-unique message id. */
export const pollsService = {
  async createEventPoll(
    eventId: string,
    question: string,
    options: string[],
    anonymous: boolean,
    replyTo?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_event_poll', {
      p_event_id: eventId,
      p_question: question,
      p_options: options,
      p_anonymous: anonymous,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async createGroupPoll(
    groupId: string,
    question: string,
    options: string[],
    anonymous: boolean,
    replyTo?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_group_poll', {
      p_group: groupId,
      p_question: question,
      p_options: options,
      p_anonymous: anonymous,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async createDmPoll(
    dmId: string,
    question: string,
    options: string[],
    anonymous: boolean,
    replyTo?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_dm_poll', {
      p_dm: dmId,
      p_question: question,
      p_options: options,
      p_anonymous: anonymous,
      p_reply_to: replyTo ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** Cast, change, or retract (tap your current choice) a vote. */
  async vote(messageId: string, optionId: string): Promise<void> {
    const { error } = await supabase.rpc('vote_poll', {
      p_message_id: messageId,
      p_option_id: optionId,
    });
    if (error) throw error;
  },

  /** Per-poll view state (my choice + non-anonymous voter profiles) for a
   *  batch of poll message ids, keyed by message id. Counts themselves
   *  ride on the message row, so this only carries what that can't. */
  async details(messageIds: string[]): Promise<Map<string, PollDetails>> {
    const out = new Map<string, PollDetails>();
    if (messageIds.length === 0) return out;
    const { data, error } = await supabase.rpc('get_poll_details', {
      p_message_ids: messageIds,
    });
    if (error) throw error;
    for (const row of data ?? []) {
      out.set(row.message_id, {
        myOption: row.my_option,
        voters: row.voters,
      });
    }
    return out;
  },
};
