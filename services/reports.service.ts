import type { TranslationKey } from '@/i18n';
import { supabase } from './supabase';

export type ReportTargetType = 'user' | 'review' | 'event' | 'hashtag' | 'message';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ModerationAction = 'warn' | 'mute' | 'unmute' | 'ban' | 'unban';

/** The reasons a reporter can pick. Stored as the `key`; the label is
 *  what both the report sheet and the admin queue render. */
export const REPORT_REASONS: { key: string; labelKey: TranslationKey }[] = [
  { key: 'harassment', labelKey: 'reason.harassment' },
  { key: 'hate', labelKey: 'reason.hate' },
  { key: 'drugs', labelKey: 'reason.drugs' },
  { key: 'violence', labelKey: 'reason.violence' },
  { key: 'sexual', labelKey: 'reason.sexual' },
  { key: 'spam', labelKey: 'reason.spam' },
  { key: 'impersonation', labelKey: 'reason.impersonation' },
  { key: 'false_review', labelKey: 'reason.false_review' },
  { key: 'hashtag', labelKey: 'reason.hashtag' },
  { key: 'other', labelKey: 'reason.other' },
];

/** Dictionary key for a stored reason code, or null when the code came
 *  from a newer build than this client knows about. */
export function reasonLabelKey(key: string): TranslationKey | null {
  return REPORT_REASONS.find((r) => r.key === key)?.labelKey ?? null;
}

/** Mute presets offered in the admin queue. */
export const MUTE_OPTIONS: { labelKey: TranslationKey; minutes: number }[] = [
  { labelKey: 'mute.30min', minutes: 30 },
  { labelKey: 'mute.60min', minutes: 60 },
  { labelKey: 'mute.24h', minutes: 60 * 24 },
  { labelKey: 'mute.week', minutes: 60 * 24 * 7 },
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
export const ASSIGNABLE_ROLES: {
  key: 'support' | 'admin' | 'user';
  labelKey: TranslationKey;
  hintKey: TranslationKey;
}[] = [
  { key: 'support', labelKey: 'role.support', hintKey: 'role.supportHint' },
  { key: 'admin', labelKey: 'role.admin', hintKey: 'role.adminHint' },
  { key: 'user', labelKey: 'role.remove', hintKey: 'role.removeHint' },
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
