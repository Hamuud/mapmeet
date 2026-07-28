import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import {
  ASSIGNABLE_ROLES,
  MUTE_OPTIONS,
  reasonLabel,
  reportsService,
  type AdminReport,
  type ReportStatus,
  type StaffMember,
} from '@/services/reports.service';
import { formatRelativeTime } from '@/utils/format';
import { goBack } from '@/utils/nav';

type Filter = ReportStatus | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
];
type Tab = 'reports' | 'roles';

/** Complaints & reports — the moderation queue. Admin-only: the screen
 *  gates on my_moderation_state().isAdmin, and every RPC it calls
 *  re-checks is_admin() server-side, so this is UI convenience, not the
 *  security boundary. */
export default function AdminScreen() {
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
      toast.show(e instanceof Error ? e.message : 'Could not load reports', 'error');
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
        toast.show(e instanceof Error ? e.message : 'Action failed', 'error');
      }
    },
    [load, toast],
  );

  if (isAdmin === false) {
    return (
      <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
        <EmptyState
          emoji="🔒"
          title="Admins only"
          description="This screen is limited to moderators."
          actionLabel="Go back"
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
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Complaints & reports
          </Text>
          <Text className="text-xs text-muted-light">{reports.length} shown</Text>
        </View>
        <Pressable
          onPress={() => void load()}
          accessibilityLabel="Refresh"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="refresh" size={17} color={iconColor} />
        </Pressable>
      </View>

      {/* Reports / Roles — the Roles tab is owner-only. */}
      {isOwner ? (
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

      {tab === 'roles' && isOwner ? <RolesPanel /> : null}

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
                    {f.label}
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
              title="Nothing to review"
              description={
                filter === 'open'
                  ? 'No open complaints right now.'
                  : 'No reports in this bucket.'
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
                  {item.target_display_name ?? item.target_text ?? 'Unknown target'}
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
                    {reasonLabel(r)}
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
                {target.target_display_name ?? target.target_text ?? 'Report'}
              </Text>
              <Text className="text-xs text-muted-light">
                Reported by @{target.reporter_username} ·{' '}
                {target.reasons.map(reasonLabel).join(', ')}
              </Text>
            </View>

            <StatusStrip report={target} />

            {/* Report outcome */}
            <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
              Report
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton
                  label="Dismiss (false)"
                  variant="secondary"
                  onPress={() =>
                    void act(
                      () => reportsService.resolve(target.id, 'dismissed'),
                      'Report dismissed.',
                    )
                  }
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  label="Mark resolved"
                  variant="secondary"
                  onPress={() =>
                    void act(
                      () => reportsService.resolve(target.id, 'resolved'),
                      'Report resolved.',
                    )
                  }
                  fullWidth
                />
              </View>
            </View>

            {target.target_type === 'review' && target.target_id ? (
              <PrimaryButton
                label="Delete this review"
                variant="destructive-outline"
                leftIcon={<Ionicons name="trash-outline" size={14} color="#B91C1C" />}
                onPress={() =>
                  void act(
                    () => reportsService.deleteReview(target.target_id!),
                    'Review deleted.',
                  )
                }
                fullWidth
              />
            ) : null}

            {target.target_user_id ? (
              <>
                <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  Act on the account
                </Text>
                <PrimaryButton
                  label="Issue warning"
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
                      'Warning issued.',
                    )
                  }
                  fullWidth
                />

                <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  Mute
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
                          `Muted for ${m.label}.`,
                        )
                      }
                      className="rounded-xl border border-border-light bg-elevated-light px-4 py-2 active:opacity-70 dark:border-border-dark dark:bg-elevated-dark"
                    >
                      <Text className="text-[13px] font-semibold text-text-light dark:text-text-dark">
                        {m.label}
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
                          'Mute lifted.',
                        )
                      }
                      className="rounded-xl border border-brand-500 px-4 py-2 active:opacity-70"
                    >
                      <Text className="text-[13px] font-semibold text-brand-500">
                        Unmute
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {target.target_banned ? (
                  <PrimaryButton
                    label="Lift ban"
                    variant="secondary"
                    onPress={() =>
                      void act(
                        () =>
                          reportsService.moderate({
                            userId: target.target_user_id!,
                            action: 'unban',
                            reportId: target.id,
                          }),
                        'Ban lifted.',
                      )
                    }
                    fullWidth
                  />
                ) : (
                  <PrimaryButton
                    label="Ban permanently"
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
        title={`Ban ${confirmBan?.target_display_name ?? 'this user'}?`}
        message="They'll be blocked from posting messages, creating events and leaving reviews until the ban is lifted."
        confirmLabel="Ban"
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
              'Account banned.',
            );
          }
        }}
        onCancel={() => setConfirmBan(null)}
      />
    </SafeAreaView>
  );
}

/** Owner-only: grant Support/Admin by username, and see who holds what.
 *  Staff can open the reports queue; only the owner can reach this panel,
 *  and assign_role re-checks that server-side. */
function RolesPanel() {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'support' | 'admin' | 'user'>('support');
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

  const handleAssign = async () => {
    const handle = username.trim().replace(/^@/, '');
    if (!handle || busy) return;
    setBusy(true);
    try {
      await reportsService.assignRole(handle, role);
      toast.show(
        role === 'user' ? `Removed @${handle}'s access.` : `@${handle} is now ${role}.`,
        'success',
      );
      setUsername('');
      await loadStaff();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not assign role', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
          Assign a role
        </Text>
        <View className="h-12 justify-center rounded-2xl border border-border-light bg-elevated-light px-4 dark:border-border-dark dark:bg-elevated-dark">
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="username (without @)"
            placeholderTextColor="#8B8880"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-[15px] text-text-light outline-none dark:text-text-dark"
          />
        </View>

        <View className="gap-2">
          {ASSIGNABLE_ROLES.map((r) => {
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
                    {r.label}
                  </Text>
                  <Text className="text-xs text-muted-light">{r.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton
          label="Apply role"
          loading={busy}
          disabled={!username.trim()}
          onPress={handleAssign}
          fullWidth
        />
      </View>

      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
          Current staff · {staff.length}
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
                m.role === 'owner' ? 'bg-brand-500/15' : 'bg-elevated-light dark:bg-elevated-dark'
              }`}
            >
              <Text
                className={`font-mono text-[10px] uppercase ${
                  m.role === 'owner' ? 'text-brand-500' : 'text-muted-light'
                }`}
              >
                {m.role}
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
  if (!report.target_user_id) return null;
  const muted =
    report.target_muted_until && new Date(report.target_muted_until) > new Date()
      ? report.target_muted_until
      : null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {report.target_banned ? (
        <Chip tone="danger" label="Banned" />
      ) : muted ? (
        <Chip tone="warn" label={`Muted until ${new Date(muted).toLocaleString()}`} />
      ) : (
        <Chip tone="ok" label="Active" />
      )}
      {(report.target_warnings ?? 0) > 0 ? (
        <Chip tone="warn" label={`${report.target_warnings} warning(s)`} />
      ) : null}
      <Chip tone="muted" label={`${report.target_report_count ?? 0} report(s)`} />
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
