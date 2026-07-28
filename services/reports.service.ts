import { supabase } from './supabase';

export type ReportTargetType = 'user' | 'review' | 'event' | 'hashtag' | 'message';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ModerationAction = 'warn' | 'mute' | 'unmute' | 'ban' | 'unban';

/** The reasons a reporter can pick. Stored as the `key`; the label is
 *  what both the report sheet and the admin queue render. */
export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'drugs', label: 'Prohibited substances' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'sexual', label: 'Sexual or explicit content' },
  { key: 'spam', label: 'Spam or scam' },
  { key: 'impersonation', label: 'Impersonation / fake profile' },
  { key: 'false_review', label: 'False or fake review' },
  { key: 'hashtag', label: 'Prohibited hashtag' },
  { key: 'other', label: 'Something else' },
];

export function reasonLabel(key: string): string {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}

/** Mute presets offered in the admin queue. */
export const MUTE_OPTIONS: { label: string; minutes: number }[] = [
  { label: '30 min', minutes: 30 },
  { label: '60 min', minutes: 60 },
  { label: '24 h', minutes: 60 * 24 },
  { label: '1 week', minutes: 60 * 24 * 7 },
];

export type AdminReport = {
  id: string;
  target_type: ReportTargetType;
  target_id: string | null;
  target_text: string | null;
  reasons: string[];
  details: string | null;
  status: ReportStatus;
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
};

export type StaffRole = 'user' | 'support' | 'admin' | 'owner';

export type MyModerationState = {
  mutedUntil: string | null;
  banned: boolean;
  warnings: number;
  /** Any staff tier — grants the Complaints & reports screen. */
  isAdmin: boolean;
  role: StaffRole;
  /** Only the owner can assign roles. */
  isOwner: boolean;
};

export type StaffMember = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: StaffRole;
};

/** Assignable tiers — 'owner' is deliberately absent: it can't be handed
 *  out or taken away through the app. */
export const ASSIGNABLE_ROLES: { key: 'support' | 'admin' | 'user'; label: string; hint: string }[] = [
  { key: 'support', label: 'Support', hint: 'Reviews reports; cannot assign roles' },
  { key: 'admin', label: 'Admin', hint: 'Full moderation; cannot assign roles' },
  { key: 'user', label: 'Remove access', hint: 'Back to a regular account' },
];

export const reportsService = {
  /** File a complaint. `reasons` is one or more REPORT_REASONS keys. */
  async submit(input: {
    targetType: ReportTargetType;
    reasons: string[];
    targetUserId?: string | null;
    targetId?: string | null;
    targetText?: string | null;
    details?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('submit_report', {
      p_target_type: input.targetType,
      p_reasons: input.reasons,
      p_target_user: input.targetUserId ?? null,
      p_target_id: input.targetId ?? null,
      p_target_text: input.targetText ?? null,
      p_details: input.details ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** The caller's own standing — drives the admin entry point and any
   *  "you're muted" messaging. */
  async myState(): Promise<MyModerationState> {
    const { data, error } = await supabase.rpc('my_moderation_state');
    if (error) throw error;
    const row = (data as
      | {
          muted_until: string | null;
          banned: boolean;
          warnings: number;
          is_admin: boolean;
          role: StaffRole;
          is_owner: boolean;
        }[]
      | null)?.[0];
    return {
      mutedUntil: row?.muted_until ?? null,
      banned: !!row?.banned,
      warnings: row?.warnings ?? 0,
      isAdmin: !!row?.is_admin,
      role: row?.role ?? 'user',
      isOwner: !!row?.is_owner,
    };
  },

  // ── Admin only (server re-checks is_admin on every call) ──────────────

  async list(status: ReportStatus | 'all' = 'open'): Promise<AdminReport[]> {
    const { data, error } = await supabase.rpc('admin_list_reports', {
      p_status: status,
    });
    if (error) throw error;
    return (data as AdminReport[] | null) ?? [];
  },

  /** Mark a report resolved, or dismiss it as false. */
  async resolve(
    reportId: string,
    status: Exclude<ReportStatus, 'open'>,
    note?: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report: reportId,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) throw error;
  },

  async moderate(input: {
    userId: string;
    action: ModerationAction;
    minutes?: number | null;
    reportId?: string | null;
    note?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc('admin_moderate_user', {
      p_user: input.userId,
      p_action: input.action,
      p_minutes: input.minutes ?? null,
      p_report: input.reportId ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
  },

  /** Owner only: grant or revoke staff access by username. */
  async assignRole(username: string, role: 'support' | 'admin' | 'user'): Promise<void> {
    const { error } = await supabase.rpc('assign_role', {
      p_username: username,
      p_role: role,
    });
    if (error) throw error;
  },

  /** Everyone currently holding a staff role. */
  async listStaff(): Promise<StaffMember[]> {
    const { data, error } = await supabase.rpc('list_staff');
    if (error) throw error;
    return (data as StaffMember[] | null) ?? [];
  },

  /** Remove a review judged false or abusive. */
  async deleteReview(reviewId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_review', {
      p_review: reviewId,
    });
    if (error) throw error;
  },
};
