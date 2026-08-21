import type { TranslationKey } from '@/i18n';
import type { UserRole as SchemaUserRole } from '@/types/database';
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
  /** Present only on reports about an event: the tags it carries right
   *  now. Null everywhere else, which is a different thing from an
   *  empty list — an event always has at least one tag. */
  target_event_tags: string[] | null;
};

/** Re-exported so callers that already import from this service don't
 *  have to reach into the schema types. */
export type UserRole = SchemaUserRole;

export type MyModerationState = {
  mutedUntil: string | null;
  banned: boolean;
  warnings: number;
  /** Any staff tier — grants the Complaints & reports screen. */
  isAdmin: boolean;
  role: UserRole;
  /** Only the owner can assign roles. */
  isOwner: boolean;
};

export type StaffMember = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
};

export type AssignableRole =
  | 'premium'
  | 'designer'
  | 'support'
  | 'admin'
  | 'user';

/** Assignable tiers — 'owner' is deliberately absent: it can't be handed
 *  out or taken away through the app.
 *
 *  `ownerOnly` mirrors the split inside assign_role: an admin may grant
 *  and revoke premium, but only the owner touches the staff chain. The
 *  server re-checks; this flag only decides what the panel offers. */
export const ASSIGNABLE_ROLES: {
  key: AssignableRole;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  ownerOnly: boolean;
}[] = [
  { key: 'premium', labelKey: 'role.premium', hintKey: 'role.premiumHint', ownerOnly: false },
  // Staff-side: it carries moderation access, so the owner hands it out.
  { key: 'designer', labelKey: 'role.designer', hintKey: 'role.designerHint', ownerOnly: true },
  { key: 'support', labelKey: 'role.support', hintKey: 'role.supportHint', ownerOnly: true },
  { key: 'admin', labelKey: 'role.admin', hintKey: 'role.adminHint', ownerOnly: true },
  { key: 'user', labelKey: 'role.remove', hintKey: 'role.removeHint', ownerOnly: false },
];

/** Display label per role, including the ones nobody can assign.
 *  The panel listed the raw slug before; 'designer' has an actual name
 *  and printing "designer" at people is worse than printing nothing. */
export const ROLE_LABEL: Record<UserRole, TranslationKey> = {
  user: 'role.plain',
  premium: 'role.premium',
  designer: 'role.designer',
  support: 'role.support',
  admin: 'role.admin',
  owner: 'role.owner',
};

/** How many complaints the viewer may still file in the current rolling
 *  24 hours. `max` null means unlimited — staff, who work the queue. */
export type ReportQuota = {
  used: number;
  max: number | null;
  resetsAt: string | null;
};

/** submit_report rejects an over-cap complaint with
 *  `REPORT_LIMIT <n> <iso>`. PostgREST hands that back as prose in
 *  `error.message`, so the cap and the reset time have to be picked back
 *  out of the string — there is nowhere else to put them.
 *
 *  Returns null for anything that isn't that error, so a caller can fall
 *  through to its normal failure path. */
export function parseReportLimitError(
  e: unknown,
): { limit: number; resetsAt: string } | null {
  const message = e instanceof Error ? e.message : String(e ?? '');
  const m = /REPORT_LIMIT (\d+) (\S+)/.exec(message);
  if (!m) return null;
  return { limit: Number(m[1]), resetsAt: m[2]! };
}

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
          role: UserRole;
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

  /** Grant or revoke a role by username. Admins may only move people
   *  in and out of 'premium'; assign_role rejects anything else. */
  async assignRole(username: string, role: AssignableRole): Promise<void> {
    const { error } = await supabase.rpc('assign_role', {
      p_username: username,
      p_role: role,
    });
    if (error) throw error;
  },

  /** Everyone holding any role above plain 'user' — staff and premium
   *  members alike, which is what the Roles panel lists. */
  async listStaff(): Promise<StaffMember[]> {
    const { data, error } = await supabase.rpc('list_staff');
    if (error) throw error;
    return (data as StaffMember[] | null) ?? [];
  },

  /** Strip rule-breaking tags off a reported event, leaving the event
   *  itself alone. The middle ground the queue was missing: a complaint
   *  about one bad hashtag shouldn't have to be answered with a mute.
   *
   *  Returns the tags that remain, so the panel can repaint from the
   *  server's answer instead of guessing — which matters because an
   *  event must keep at least one tag, and removing the last one leaves
   *  'general' rather than nothing. */
  async removeEventTags(
    eventId: string,
    tags: string[],
    reportId?: string | null,
  ): Promise<string[]> {
    const { data, error } = await supabase.rpc('admin_remove_event_tags', {
      p_event: eventId,
      p_tags: tags,
      p_report: reportId ?? null,
    });
    if (error) throw error;
    return (data as string[] | null) ?? [];
  },

  /** Take a reported event off the map entirely.
   *
   *  Resolves every open report about that event, not just the one the
   *  moderator acted from — three people reporting the same event is the
   *  normal case, and the other two shouldn't be left pointing at a row
   *  that no longer exists. Returns how many it closed.
   *
   *  Attendees get the same "it's cancelled" push a host deletion sends;
   *  that is `capture_event_cancellation`, which runs regardless of who
   *  did the deleting. */
  async deleteEvent(eventId: string, reportId?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('admin_delete_event', {
      p_event: eventId,
      p_report: reportId ?? null,
      p_note: null,
    });
    if (error) throw error;
    return (data as number | null) ?? 0;
  },

  /** The viewer's own report allowance. Null when the call fails — this
   *  only drives a counter, and submit_report is the real cap. */
  async myReportQuota(): Promise<ReportQuota | null> {
    const { data, error } = await supabase.rpc('my_report_quota');
    if (error) return null;
    const row = (data as
      | { used: number; max_per_day: number | null; resets_at: string | null }[]
      | null)?.[0];
    if (!row) return null;
    return { used: row.used, max: row.max_per_day, resetsAt: row.resets_at };
  },

  /** Remove a review judged false or abusive. */
  async deleteReview(reviewId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_review', {
      p_review: reviewId,
    });
    if (error) throw error;
  },
};
