import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currentBcp47, useT, type TranslationKey } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  ROLE_LABEL,
  MUTE_OPTIONS,
  reasonLabelKey,
  reportsService,
  type AdminReport,
  type ReportStatus,
  type StaffMember,
} from '@/services/reports.service';
import { formatRelativeTime } from '@/utils/format';
import { goBack } from '@/utils/nav';

type Filter = ReportStatus | 'all';
const FILTERS: { key: Filter; labelKey: TranslationKey }[] = [
  { key: 'open', labelKey: 'admin.tabOpen' },
  { key: 'resolved', labelKey: 'admin.tabResolved' },
  { key: 'dismissed', labelKey: 'admin.tabDismissed' },
  { key: 'all', labelKey: 'filter.all' },
];
type Tab = 'reports' | 'roles';

/** Complaints & reports — the moderation queue. Admin-only: the screen
 *  gates on my_moderation_state().isAdmin, and every RPC it calls
 *  re-checks is_admin() server-side, so this is UI convenience, not the
 *  security boundary. */
export default function AdminScreen() {
  const t = useT();
  // Reason codes come back from the DB; unknown ones (newer build) fall
  // through as the raw code rather than rendering blank.
  const tReason = (code: string) => {
    const key = reasonLabelKey(code);
    return key ? t(key) : code;
  };
  const toast = useToast();
  const iconColor = useIconColor();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [tab, setTab] = useState<Tab>('reports');
  const [filter, setFilter] = useState<Filter>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AdminReport | null>(null);
  const [confirmBan, setConfirmBan] = useState<AdminReport | null>(null);
  /** Which tag is mid-flight, so only that chip shows a spinner. */
  const [removingTag, setRemovingTag] = useState<string | null>(null);

  useEffect(() => {
    reportsService
      .myState()
      .then((s) => {
        setIsAdmin(s.isAdmin);
        setIsOwner(s.isOwner);
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await reportsService.list(filter));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('admin.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const act = useCallback(
    async (fn: () => Promise<void>, okMessage: string) => {
      try {
        await fn();
        setTarget(null);
        toast.show(okMessage, 'success');
        await load();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('admin.actionFailed'), 'error');
      }
    },
    [load, toast],
  );

  /** Strip one tag off the reported event.
   *
   *  Deliberately NOT routed through `act`: that closes the sheet and
   *  re-fetches the whole queue, and a report with three bad tags on it
   *  would mean reopening the sheet twice. This repaints from the tags
   *  the RPC returns — which is also the only honest source, since the
   *  server substitutes 'general' when the last one goes. */
  const removeTag = useCallback(
    async (report: AdminReport, tag: string) => {
      if (!report.target_id) return;
      setRemovingTag(tag);
      try {
        const left = await reportsService.removeEventTags(
          report.target_id,
          [tag],
          report.id,
        );
        setTarget((cur) =>
          cur && cur.id === report.id ? { ...cur, target_event_tags: left } : cur,
        );
        // Every open report about the same event shows the same tags.
        setReports((rs) =>
          rs.map((r) =>
            r.target_type === 'event' && r.target_id === report.target_id
              ? { ...r, target_event_tags: left }
              : r,
          ),
        );
        toast.show(t('admin.tagRemoved', { tag }), 'success');
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('admin.actionFailed'), 'error');
      } finally {
        setRemovingTag(null);
      }
    },
    [toast],
  );

  if (isAdmin === false) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="🔒"
          title={t('admin.adminsOnly')}
          description={t('admin.adminsOnlyHint')}
          actionLabel={t('user.goBack')}
          onAction={() => goBack('/settings')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      <View className="flex-row items-center gap-2.5 border-b border-border-light px-3 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/settings')}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {t('admin.title')}
          </Text>
          <Text className="text-xs text-muted-light">{reports.length} shown</Text>
        </View>
        <Pressable
          onPress={() => void load()}
          accessibilityLabel={t('admin.refresh')}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="refresh" size={17} color={iconColor} />
        </Pressable>
      </View>

      {/* Reports / Roles. Any staff member sees the tab: admins need it
          to grant premium. What the panel offers inside is what differs
          — staff tiers stay owner-only, and assign_role re-checks. */}
      {isAdmin ? (
        <View className="flex-row gap-6 border-b border-border-light px-4 dark:border-border-dark">
          {(['reports', 'roles'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} className="pb-2.5 pt-2">
              <View
                className={[
                  'border-b-2',
                  tab === t ? 'border-text-light dark:border-text-dark' : 'border-transparent',
                ].join(' ')}
              >
                <Text
                  className={[
                    'pb-1.5 text-sm font-semibold capitalize',
                    tab === t
                      ? 'text-text-light dark:text-text-dark'
                      : 'text-muted-light',
                  ].join(' ')}
                >
                  {t}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {tab === 'roles' && isAdmin ? <RolesPanel isOwner={!!isOwner} /> : null}

      {/* Status filter */}
      {tab === 'reports' ? (
      <View className="border-b border-border-light px-3 py-2 dark:border-border-dark">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  className={[
                    'rounded-full px-3.5 py-1.5',
                    on
                      ? 'bg-text-light dark:bg-text-dark'
                      : 'border border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'text-xs font-semibold',
                      on
                        ? 'text-surface-light dark:text-surface-dark'
                        : 'text-muted-light',
                    ].join(' ')}
                  >
                    {t(f.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
      ) : null}

      {tab === 'reports' ? (
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              emoji="✅"
              title={t('admin.nothingToReview')}
              description={
                filter === 'open'
                  ? t('admin.noOpen')
                  : t('admin.noneInBucket')
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setTarget(item)}
            className="gap-2 rounded-2xl border border-border-light bg-panel-light p-4 active:opacity-80 dark:border-border-dark dark:bg-panel-dark"
          >
            <View className="flex-row items-center gap-2.5">
              {item.target_user_id ? (
                <Avatar
                  name={item.target_display_name ?? '?'}
                  uri={item.target_avatar_url}
                  size="sm"
                />
              ) : (
                <View className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark">
                  <Ionicons name="pricetag-outline" size={15} color="#8B8880" />
                </View>
              )}
              <View className="flex-1">
                <Text
                  className="text-sm font-bold text-text-light dark:text-text-dark"
                  numberOfLines={1}
                >
                  {item.target_display_name ?? item.target_text ?? t('admin.unknownTarget')}
                </Text>
                <Text className="text-[11px] text-muted-light" numberOfLines={1}>
                  {item.target_type}
                  {item.target_username ? ` · @${item.target_username}` : ''} · by @
                  {item.reporter_username} · {formatRelativeTime(item.created_at)}
                </Text>
              </View>
              {item.status !== 'open' ? (
                <View className="rounded-full bg-elevated-light px-2 py-0.5 dark:bg-elevated-dark">
                  <Text className="font-mono text-[9px] uppercase text-muted-light">
                    {item.status}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="flex-row flex-wrap gap-1">
              {item.reasons.map((r) => (
                <View key={r} className="rounded-full bg-red-500/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-red-600">
                    {tReason(r)}
                  </Text>
                </View>
              ))}
            </View>

            {item.details ? (
              <Text
                className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark"
                numberOfLines={3}
              >
                {item.details}
              </Text>
            ) : null}

            <StatusStrip report={item} />
          </Pressable>
        )}
      />
      ) : null}

      {/* Action sheet */}
      <BottomSheet open={!!target} onClose={() => setTarget(null)} heightPct={0.9} autoHeight>
        {target ? (
          <View className="gap-3 pb-2">
            <View className="gap-0.5">
              <Text className="text-lg font-bold text-text-light dark:text-text-dark">
                {target.target_display_name ?? target.target_text ?? t('admin.report')}
              </Text>
              <Text className="text-xs text-muted-light">
                Reported by @{target.reporter_username} ·{' '}
                {target.reasons.map(tReason).join(', ')}
              </Text>
            </View>

            <StatusStrip report={target} />

            {/* Report outcome */}
            <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {t('admin.report')}
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label={t('admin.dismissFalse')}
                  variant="secondary"
                  onPress={() =>
                    void act(
                      () => reportsService.resolve(target.id, 'dismissed'),
                      t('admin.dismissed'),
                    )
                  }
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  label={t('admin.markResolved')}
                  variant="secondary"
                  onPress={() =>
                    void act(
                      () => reportsService.resolve(target.id, 'resolved'),
                      t('admin.resolved'),
                    )
                  }
                  fullWidth
                />
              </View>
            </View>

            {target.target_type === 'review' && target.target_id ? (
              <PrimaryButton
                label={t('admin.deleteReview')}
                variant="destructive-outline"
                leftIcon={<Ionicons name="trash-outline" size={14} color="#B91C1C" />}
                onPress={() =>
                  void act(
                    () => reportsService.deleteReview(target.target_id!),
                    t('admin.reviewDeleted'),
                  )
                }
                fullWidth
              />
            ) : null}

            {/* Act on the content, not the account. A complaint about a
                hashtag is usually answered by taking the hashtag off —
                muting the host for it is the wrong size of hammer, and
                until now it was the only one in the queue. */}
            {target.target_type === 'event' &&
            target.target_id &&
            target.target_event_tags ? (
              <>
                <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  {t('admin.eventTags')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {target.target_event_tags.map((tag) => (
                    <Pressable
                      key={tag}
                      disabled={removingTag !== null}
                      onPress={() => void removeTag(target, tag)}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.removeTag', { tag })}
                      className="flex-row items-center gap-1.5 rounded-xl border border-red-300 bg-panel-light px-3 py-2 active:opacity-70 dark:bg-panel-dark"
                    >
                      <Text className="text-[13px] font-semibold text-text-light dark:text-text-dark">
                        #{tag}
                      </Text>
                      {removingTag === tag ? (
                        <ActivityIndicator size="small" color="#B91C1C" />
                      ) : (
                        <Ionicons name="close-circle" size={14} color="#B91C1C" />
                      )}
                    </Pressable>
                  ))}
                </View>
                <Text className="text-[11px] leading-snug text-muted-light dark:text-muted-dark">
                  {t('admin.tagsHint')}
                </Text>
              </>
            ) : null}

            {target.target_user_id ? (
              <>
                <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  {t('admin.actOnAccount')}
                </Text>
                <PrimaryButton
                  label={t('admin.issueWarning')}
                  variant="secondary"
                  leftIcon={<Ionicons name="alert-circle-outline" size={14} color="#4B5FE0" />}
                  onPress={() =>
                    void act(
                      () =>
                        reportsService.moderate({
                          userId: target.target_user_id!,
                          action: 'warn',
                          reportId: target.id,
                        }),
                      t('admin.warningIssued'),
                    )
                  }
                  fullWidth
                />

                <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  {t('admin.mute')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUTE_OPTIONS.map((m) => (
                    <Pressable
                      key={m.minutes}
                      onPress={() =>
                        void act(
                          () =>
                            reportsService.moderate({
                              userId: target.target_user_id!,
                              action: 'mute',
                              minutes: m.minutes,
                              reportId: target.id,
                            }),
                          t('admin.mutedFor', { label: t(m.labelKey) }),
                        )
                      }
                      className="rounded-xl border border-border-light bg-elevated-light px-4 py-2 active:opacity-70 dark:border-border-dark dark:bg-elevated-dark"
                    >
                      <Text className="text-[13px] font-semibold text-text-light dark:text-text-dark">
                        {t(m.labelKey)}
                      </Text>
                    </Pressable>
                  ))}
                  {target.target_muted_until ? (
                    <Pressable
                      onPress={() =>
                        void act(
                          () =>
                            reportsService.moderate({
                              userId: target.target_user_id!,
                              action: 'unmute',
                              reportId: target.id,
                            }),
                          t('admin.muteLifted'),
                        )
                      }
                      className="rounded-xl border border-brand-500 px-4 py-2 active:opacity-70"
                    >
                      <Text className="text-[13px] font-semibold text-brand-500">
                        {t('admin.unmute')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {target.target_banned ? (
                  <PrimaryButton
                    label={t('admin.liftBan')}
                    variant="secondary"
                    onPress={() =>
                      void act(
                        () =>
                          reportsService.moderate({
                            userId: target.target_user_id!,
                            action: 'unban',
                            reportId: target.id,
                          }),
                        t('admin.banLifted'),
                      )
                    }
                    fullWidth
                  />
                ) : (
                  <PrimaryButton
                    label={t('admin.banPermanently')}
                    variant="destructive"
                    onPress={() => setConfirmBan(target)}
                    fullWidth
                  />
                )}
              </>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmationDialog
        open={!!confirmBan}
        title={t('admin.banTitle', { name: confirmBan?.target_display_name ?? t('admin.thisUser') })}
        message={t('admin.banMessage')}
        confirmLabel={t('admin.banConfirm')}
        destructive
        onConfirm={() => {
          const r = confirmBan;
          setConfirmBan(null);
          if (r?.target_user_id) {
            void act(
              () =>
                reportsService.moderate({
                  userId: r.target_user_id!,
                  action: 'ban',
                  reportId: r.id,
                }),
              t('admin.banned'),
            );
          }
        }}
        onCancel={() => setConfirmBan(null)}
      />
    </SafeAreaView>
  );
}

/** Grant a role by username, and see who holds what.
 *
 *  Two audiences: the owner, who can hand out the staff tiers, and
 *  admins, who can only move people in and out of premium. The list is
 *  filtered to match, but the split is enforced in assign_role — this is
 *  presentation, not permission. */
function RolesPanel({ isOwner }: { isOwner: boolean }) {
  const t = useT();
  const toast = useToast();
  const options = ASSIGNABLE_ROLES.filter((r) => isOwner || !r.ownerOnly);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<AssignableRole>(
    isOwner ? 'support' : 'premium',
  );
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [busy, setBusy] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      setStaff(await reportsService.listStaff());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const roleLabel =
    options.find((r) => r.key === role)?.labelKey ?? 'role.premium';

  const handleAssign = async () => {
    const handle = username.trim().replace(/^@/, '');
    if (!handle || busy) return;
    setBusy(true);
    try {
      await reportsService.assignRole(handle, role);
      toast.show(
        role === 'user'
          ? t('admin.roleRemoved', { handle })
          : t('admin.roleGranted', { handle, role: t(roleLabel) }),
        'success',
      );
      setUsername('');
      await loadStaff();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('admin.roleFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
          {t('admin.assignRole')}
        </Text>
        <View className="h-12 justify-center rounded-2xl border border-border-light bg-elevated-light px-4 dark:border-border-dark dark:bg-elevated-dark">
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder={t('admin.usernamePlaceholder')}
            placeholderTextColor="#8B8880"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-[15px] text-text-light outline-none dark:text-text-dark"
          />
        </View>

        <View className="gap-2">
          {options.map((r) => {
            const on = role === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRole(r.key)}
                className={[
                  'flex-row items-center gap-3 rounded-2xl border px-4 py-3',
                  on
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                ].join(' ')}
              >
                <View
                  className={[
                    'h-5 w-5 items-center justify-center rounded-full border-2',
                    on ? 'border-brand-500' : 'border-muted-light',
                  ].join(' ')}
                >
                  {on ? <View className="h-2.5 w-2.5 rounded-full bg-brand-500" /> : null}
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                    {t(r.labelKey)}
                  </Text>
                  <Text className="text-xs text-muted-light">{t(r.hintKey)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton
          label={t('admin.applyRole')}
          loading={busy}
          disabled={!username.trim()}
          onPress={handleAssign}
          fullWidth
        />
      </View>

      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
          {t('admin.currentRoles', { n: staff.length })}
        </Text>
        {staff.map((m) => (
          <View
            key={m.id}
            className="flex-row items-center gap-3 rounded-2xl border border-border-light bg-panel-light p-3 dark:border-border-dark dark:bg-panel-dark"
          >
            <Avatar name={m.display_name} uri={m.avatar_url} size="sm" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
                {m.display_name}
              </Text>
              <Text className="text-xs text-muted-light">@{m.username}</Text>
            </View>
            <View
              className={`rounded-full px-2.5 py-1 ${
                m.role === 'owner'
                  ? 'bg-brand-500/15'
                  : m.role === 'premium'
                    ? 'bg-[#D98C00]/15'
                    : m.role === 'designer'
                      ? 'bg-[#7C3AED]/15'
                      : 'bg-elevated-light dark:bg-elevated-dark'
              }`}
            >
              <Text
                className={`font-mono text-[10px] uppercase ${
                  m.role === 'owner'
                    ? 'text-brand-500'
                    : m.role === 'premium'
                      ? 'text-[#D98C00]'
                      : m.role === 'designer'
                        ? 'text-[#7C3AED]'
                        : 'text-muted-light'
                }`}
              >
                {t(ROLE_LABEL[m.role])}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Current standing of the reported account: bans, live mutes, warnings
 *  and how many complaints they've collected. */
function StatusStrip({ report }: { report: AdminReport }) {
  const t = useT();
  if (!report.target_user_id) return null;
  const muted =
    report.target_muted_until && new Date(report.target_muted_until) > new Date()
      ? report.target_muted_until
      : null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {report.target_banned ? (
        <Chip tone="danger" label={t('admin.chipBanned')} />
      ) : muted ? (
        <Chip
          tone="warn"
          label={t('admin.chipMutedUntil', {
            date: new Date(muted).toLocaleString(currentBcp47()),
          })}
        />
      ) : (
        <Chip tone="ok" label={t('admin.chipActive')} />
      )}
      {(report.target_warnings ?? 0) > 0 ? (
        <Chip tone="warn" label={t('admin.chipWarnings', { n: report.target_warnings ?? 0 })} />
      ) : null}
      <Chip tone="muted" label={t('admin.chipReports', { n: report.target_report_count ?? 0 })} />
    </View>
  );
}

const CHIP_BG: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'bg-green-500/10',
  warn: 'bg-amber-500/10',
  danger: 'bg-red-500/10',
  muted: 'bg-elevated-light dark:bg-elevated-dark',
};
const CHIP_TEXT: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'text-green-700',
  warn: 'text-amber-700',
  danger: 'text-red-600',
  muted: 'text-muted-light',
};

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${CHIP_BG[tone]}`}>
      <Text className={`text-[10px] font-semibold ${CHIP_TEXT[tone]}`}>{label}</Text>
    </View>
  );
}
