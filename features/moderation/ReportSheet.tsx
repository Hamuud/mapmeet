import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import {
  REPORT_REASONS,
  reportsService,
  type ReportTargetType,
} from '@/services/reports.service';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Who/what is being reported. */
  targetType: ReportTargetType;
  targetUserId?: string | null;
  targetId?: string | null;
  targetText?: string | null;
  /** Shown in the header, e.g. the person's display name. */
  targetLabel: string;
};

/** Pick one or more reasons (plus optional detail) and file a complaint.
 *  Reports land in the admin Complaints & reports queue. */
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetUserId,
  targetId,
  targetText,
  targetLabel,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setDetails('');
      setSending(false);
    }
  }, [open]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleSubmit = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    try {
      await reportsService.submit({
        targetType,
        reasons: [...selected],
        targetUserId: targetUserId ?? null,
        targetId: targetId ?? null,
        targetText: targetText ?? null,
        details: details.trim() || null,
      });
      toast.show(t('report.sent'), 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('report.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.9} autoHeight>
      <View className="gap-4 pb-2">
        <View className="gap-0.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="flag-outline" size={18} color="#B91C1C" />
            <Text className="text-lg font-bold text-text-light dark:text-text-dark">
              {t('report.title', { target: targetLabel })}
            </Text>
          </View>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            {t('report.hint')}
          </Text>
        </View>

        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          <View className="gap-1.5">
            {REPORT_REASONS.map((r) => {
              const on = selected.has(r.key);
              return (
                <Pressable
                  key={r.key}
                  onPress={() => toggle(r.key)}
                  className={[
                    'flex-row items-center gap-3 rounded-2xl border px-4 py-3',
                    on
                      ? 'border-red-400 bg-red-500/5'
                      : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                  ].join(' ')}
                >
                  <View
                    className={[
                      'h-5 w-5 items-center justify-center rounded-md border',
                      on ? 'border-red-500 bg-red-500' : 'border-muted-light',
                    ].join(' ')}
                  >
                    {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                  </View>
                  <Text className="flex-1 text-[15px] text-text-light dark:text-text-dark">
                    {t(r.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="gap-1.5">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('report.moreDetail')}
          </Text>
          <View className="rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder={t('report.detailPlaceholder')}
              placeholderTextColor="#8B8880"
              multiline
              maxLength={1000}
              className="min-h-[72px] text-[15px] text-text-light outline-none dark:text-text-dark"
              style={{ textAlignVertical: 'top' }}
            />
          </View>
        </View>

        <PrimaryButton
          label={selected.size > 1 ? t('report.sendN', { n: selected.size }) : t('report.send')}
          variant="destructive"
          loading={sending}
          disabled={selected.size === 0}
          onPress={handleSubmit}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
