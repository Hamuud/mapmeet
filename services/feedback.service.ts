import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { storageService } from './storage.service';
import { supabase } from './supabase';
import type { PickedMedia } from '@/hooks/useImagePicker';

export type FeedbackAttachment = { url: string; type: 'image' | 'video' };

/** Where feedback lands. Shown in the composer so people know who they're
 *  writing to, and used by the mail fallback. */
export const FEEDBACK_EMAIL = 'artem.liaskovets@gmail.com';

/** In-app bug reports / feedback. The message + attachment URLs are
 *  stored in Postgres (write-only from the client); the notify-feedback
 *  Edge Function forwards each new row on by email. */
export const feedbackService = {
  /** Upload the picked photos/videos, then record the report. Returns the
   *  new feedback id. Attachments are uploaded first so a storage failure
   *  surfaces before we claim the report was sent. */
  async submit(
    userId: string,
    message: string,
    media: PickedMedia[],
  ): Promise<string> {
    const attachments: FeedbackAttachment[] = [];
    for (const item of media) {
      const url = await storageService.uploadFeedbackMedia(userId, item.uri, item.kind);
      attachments.push({ url, type: item.kind });
    }

    const version =
      (Constants.expoConfig?.version as string | undefined) ?? null;

    const { data, error } = await supabase.rpc('submit_feedback', {
      p_message: message,
      p_attachments: attachments,
      p_app_version: version,
      p_platform: Platform.OS,
    });
    if (error) throw error;
    return data as string;
  },
};
