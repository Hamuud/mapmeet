import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT, type TranslationKey } from '@/i18n';
import {
  accountService,
  DELETE_REASONS,
  type DeleteReason,
} from '@/services/account.service';
import { useAuthStore } from '@/store/auth.store';

const REASON_LABEL: Record<DeleteReason, TranslationKey> = {
  not_useful: 'account.reasonNotUseful',
  too_few_events: 'account.reasonTooFewEvents',
  privacy: 'account.reasonPrivacy',
  bad_experience: 'account.reasonBadExperience',
  taking_a_break: 'account.reasonTakingABreak',
  other: 'account.reasonOther',
};

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Two-step account deletion, as required by App Store guideline
 *  5.1.1(v).
 *
 *  Step 1 asks why — that answer is filed as feedback so the team hears
 *  it, and it is the only part of this flow that is optional to read.
 *  Step 2 is a separate password prompt, deliberately not a checkbox:
 *  the account goes immediately and there is no undo, so the last thing
 *  between the user and that is proof they are the account holder. */
export function DeleteAccountSheet({ open, onClose }: Props) {
  const t = useT();
  const toast = useToast();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [reason, setReason] = useState<DeleteReason | null>(null);
  const [details, setDetails] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Never leave a typed password (or a half-finished reason) sitting in
  // state once the sheet is dismissed.
  useEffect(() => {
    if (open) return;
    setReason(null);
    setDetails('');
    setConfirmOpen(false);
    setPassword('');
    setShowPassword(false);
    setError(null);
  }, [open]);

  const handleContinue = () => {
    if (!reason) {
      toast.show(t('account.pickReason'), 'info');
      return;
    }
    setError(null);
    setPassword('');
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    const email = session?.user.email;
    const userId = session?.user.id;
    if (!reason || !email || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await accountService.deleteAccount({
        email,
        password,
        userId,
        reason,
        details,
      });
      setConfirmOpen(false);
      onClose();
      await signOut();
      toast.show(t('account.deleted'), 'success');
      router.replace('/(auth)/login');
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      setError(
        raw === 'account.wrongPassword'
          ? t('account.wrongPassword')
          : raw || t('account.deleteFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} heightPct={0.9} autoHeight>
        <View className="gap-4 pb-2">
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="trash-outline" size={18} color="#B91C1C" />
              <Text className="text-lg font-bold text-text-light dark:text-text-dark">
                {t('account.deleteTitle')}
              </Text>
            </View>
            <Text className="text-xs text-muted-light dark:text-muted-dark">
              {t('account.deleteIntro')}
            </Text>
          </View>

          <View className="gap-1 rounded-2xl border border-border-light bg-elevated-light p-3.5 dark:border-border-dark dark:bg-elevated-dark">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {t('account.whatHappens')}
            </Text>
            <Text className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark">
              {t('account.whatHappensBody')}
            </Text>
          </View>

          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('account.reasonLabel')}
          </Text>

          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            <View className="gap-1.5">
              {DELETE_REASONS.map((key) => {
                const on = reason === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setReason(key)}
                    accessibilityLabel={t(REASON_LABEL[key])}
                    className={[
                      'flex-row items-center gap-3 rounded-2xl border px-4 py-3',
                      on
                        ? 'border-red-400 bg-red-500/5'
                        : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                    ].join(' ')}
                  >
                    <View
                      className={[
                        'h-5 w-5 items-center justify-center rounded-full border',
                        on ? 'border-red-500 bg-red-500' : 'border-muted-light',
                      ].join(' ')}
                    >
                      {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <Text className="flex-1 text-[15px] text-text-light dark:text-text-dark">
                      {t(REASON_LABEL[key])}
                    </Text>
                  </Pressable>
                );
              })}

              <View className="mt-2 gap-1.5">
                <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
                  {t('account.detailsLabel')}
                </Text>
                <View className="rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
                  <TextInput
                    value={details}
                    onChangeText={setDetails}
                    placeholder={t('account.detailsPlaceholder')}
                    placeholderTextColor="#8B8880"
                    multiline
                    maxLength={2000}
                    className="min-h-[72px] text-[15px] text-text-light outline-none dark:text-text-dark"
                    style={{ textAlignVertical: 'top' }}
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          <PrimaryButton
            label={t('account.continueToConfirm')}
            variant="destructive"
            disabled={!reason}
            onPress={handleContinue}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Step 2 — password. Its own modal so it sits above the sheet and
          cannot be dismissed by the same tap that opened it. */}
      <Modal
        transparent
        visible={confirmOpen}
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <Pressable
          onPress={() => (busy ? null : setConfirmOpen(false))}
          className="flex-1 items-center justify-center bg-black/60 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-surface-light p-6 dark:bg-surface-dark"
          >
            <Text className="text-lg font-semibold text-text-light dark:text-text-dark">
              {t('account.confirmTitle')}
            </Text>
            <Text className="mt-2 text-sm text-muted-light dark:text-muted-dark">
              {t('account.confirmBody')}
            </Text>

            <View className="mt-4">
              <Input
                label={t('account.passwordLabel')}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                placeholder="••••••••"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (error) setError(null);
                }}
                error={error ?? undefined}
                rightAdornment={
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={6}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={16}
                      color="#8B8880"
                    />
                  </Pressable>
                }
              />
            </View>

            <View className="mt-6 flex-row gap-3">
              <View className="flex-1">
                <PrimaryButton
                  variant="secondary"
                  label={t('common.cancel')}
                  disabled={busy}
                  onPress={() => setConfirmOpen(false)}
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  variant="destructive"
                  label={t('account.deleteForever')}
                  loading={busy}
                  disabled={password.length === 0}
                  onPress={handleDelete}
                  fullWidth
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
