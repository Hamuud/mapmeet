import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import { currentBcp47, useT } from '@/i18n';
import { isPurchasesAvailable } from '@/services/purchases.service';
import { useSubscriptionStore } from '@/store/subscription.store';
import { goBack } from '@/utils/nav';

const LEGAL_URL = 'https://hamuud.github.io/mapmeet/legal/';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(currentBcp47(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** The paywall.
 *
 *  Its shape is not a free choice: App Store review guideline 3.1.2
 *  requires an auto-renewing subscription to state, on the screen that
 *  sells it, what you get, how long a period is, what it costs, that it
 *  renews until cancelled and how to cancel — plus reachable Terms and
 *  Privacy links and a working Restore. Apps get rejected for missing
 *  any one of those far more often than for anything technical, so none
 *  of the copy below is decoration.
 *
 *  On web there is nothing to sell — no App Store — so the buy button
 *  becomes a note pointing at the app. Entitlement itself is server-side,
 *  so somebody who subscribed on their phone sees the active state here
 *  on the website too. */
export default function PremiumScreen() {
  const t = useT();
  const toast = useToast();
  const iconColor = useIconColor();

  const active = useSubscriptionStore((s) => s.active);
  const status = useSubscriptionStore((s) => s.status);
  const entitledUntil = useSubscriptionStore((s) => s.entitledUntil);
  const willRenew = useSubscriptionStore((s) => s.willRenew);
  const loaded = useSubscriptionStore((s) => s.loaded);
  const plans = useSubscriptionStore((s) => s.plans);
  const plansLoaded = useSubscriptionStore((s) => s.plansLoaded);
  const selectedPlanId = useSubscriptionStore((s) => s.selectedPlanId);
  const selectPlan = useSubscriptionStore((s) => s.selectPlan);
  const busy = useSubscriptionStore((s) => s.busy);
  const buy = useSubscriptionStore((s) => s.buy);
  const restorePurchases = useSubscriptionStore((s) => s.restorePurchases);
  const refresh = useSubscriptionStore((s) => s.refresh);
  const loadPlans = useSubscriptionStore((s) => s.loadPlans);

  useEffect(() => {
    void refresh();
    // Load prices here rather than trusting that the tabs layout has
    // already done it: this screen is reachable without that having run,
    // and a paywall with no price on the button is worse than a slow one.
    void loadPlans();
  }, [refresh, loadPlans]);

  const sellable = isPurchasesAvailable();
  const selected = plans.find((p) => p.id === selectedPlanId) ?? null;

  /** What the annual plan saves against paying monthly for a year.
   *  Null unless both are on sale and the annual one is genuinely
   *  cheaper — a "SAVE 0%" badge is worse than no badge, and a negative
   *  one is a bug worth not advertising. */
  const annualSaving = (() => {
    const monthly = plans.find((p) => p.period === 'monthly');
    const annual = plans.find((p) => p.period === 'annual');
    if (!monthly || !annual || monthly.price <= 0) return null;
    const pct = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
    return pct > 0 ? pct : null;
  })();

  const periodLabel = (period: 'monthly' | 'annual') =>
    period === 'monthly' ? t('premium.planMonthly') : t('premium.planYearly');

  const priceLabel = (plan: { period: 'monthly' | 'annual'; priceString: string }) =>
    plan.period === 'monthly'
      ? t('premium.perMonth', { price: plan.priceString })
      : t('premium.perYear', { price: plan.priceString });

  const handleBuy = async () => {
    const outcome = await buy();
    if (outcome.kind === 'purchased') toast.show(t('premium.thanks'), 'success');
    else if (outcome.kind === 'failed') {
      toast.show(
        outcome.message === 'no offering' ? t('premium.noOffering') : outcome.message,
        'error',
      );
    }
    // 'cancelled' is a deliberate choice, not a failure. Say nothing.
  };

  const handleRestore = async () => {
    const ok = await restorePurchases();
    toast.show(ok ? t('premium.restored') : t('premium.nothingToRestore'), ok ? 'success' : 'info');
  };

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
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          {t('premium.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <View className="gap-2">
          <Text className="font-display text-4xl leading-[1.05] text-text-light dark:text-text-dark">
            {t('premium.heading')}
          </Text>
          <Text className="text-[15px] leading-snug text-ink2-light dark:text-ink2-dark">
            {t('premium.subheading')}
          </Text>
        </View>

        <View className="gap-3 rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
          <Perk icon="color-palette-outline" text={t('premium.perkColour')} />
          <Perk icon="sparkles-outline" text={t('premium.perkEffects')} />
          <Perk icon="add-circle-outline" text={t('premium.perkMarkers')} />
          <Perk icon="ribbon-outline" text={t('premium.perkBadge')} />
        </View>

        {!loaded ? (
          <ActivityIndicator />
        ) : active ? (
          <View className="gap-2 rounded-2xl border border-brand-500 bg-brand-500/10 p-4">
            <View className="flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={18} color="#4B5FE0" />
              <Text className="text-[15px] font-bold text-brand-500">
                {t('premium.activeTitle')}
              </Text>
            </View>
            {entitledUntil ? (
              <Text className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark">
                {willRenew
                  ? t('premium.renewsOn', { date: formatDate(entitledUntil) })
                  : t('premium.endsOn', { date: formatDate(entitledUntil) })}
              </Text>
            ) : null}
            {status === 'billing_issue' ? (
              <Text className="text-[13px] font-semibold text-red-700">
                {t('premium.billingIssue')}
              </Text>
            ) : null}
            <Text className="text-[12px] leading-snug text-muted-light dark:text-muted-dark">
              {t('premium.manageHint')}
            </Text>
          </View>
        ) : sellable && !plansLoaded ? (
          <ActivityIndicator />
        ) : sellable && plans.length === 0 ? (
          // The store has a key but nothing to sell: products still
          // "Missing Metadata", the Paid Applications Agreement not
          // active, a storefront with no price, or simply offline.
          //
          // This state exists because the alternative is worse than
          // useless — a Subscribe button that takes a tap and answers
          // with an error toast. That is a broken feature for a real
          // user and a Guideline 2.1 rejection in front of a reviewer.
          <View className="gap-2 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
            <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
              {t('premium.notReadyTitle')}
            </Text>
            <Text className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark">
              {t('premium.notReadyBody')}
            </Text>
          </View>
        ) : sellable ? (
          <View className="gap-3">
            {/* Plan picker. Only drawn when there is a real choice —
                one plan does not need a radio group in front of it, and
                the price is on the button either way. */}
            {plans.length > 1 ? (
              <View className="gap-2">
                {plans.map((plan) => {
                  const on = plan.id === selectedPlanId;
                  return (
                    <Pressable
                      key={plan.id}
                      onPress={() => selectPlan(plan.id)}
                      disabled={busy}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${periodLabel(plan.period)}, ${priceLabel(plan)}`}
                      className={[
                        'flex-row items-center gap-3 rounded-2xl border px-4 py-3.5',
                        on
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                      ].join(' ')}
                    >
                      <Ionicons
                        name={on ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={on ? '#4B5FE0' : '#8B8880'}
                      />
                      <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                        {periodLabel(plan.period)}
                      </Text>
                      {plan.period === 'annual' && annualSaving ? (
                        <View className="rounded-full bg-brand-500 px-2 py-0.5">
                          <Text className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                            {t('premium.savePercent', { n: annualSaving })}
                          </Text>
                        </View>
                      ) : null}
                      <Text className="flex-1 text-right text-[14px] font-semibold text-ink2-light dark:text-ink2-dark">
                        {priceLabel(plan)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <PrimaryButton
              label={
                selected
                  ? t('premium.subscribeFor', { price: priceLabel(selected) })
                  : t('premium.subscribe')
              }
              variant="accent"
              loading={busy}
              onPress={() => void handleBuy()}
              fullWidth
              size="lg"
            />
            {/* Guideline 3.1.2: length, renewal and cancellation stated
                next to the button that takes the money — and the period
                has to follow the plan actually selected, or the
                disclosure is wrong for half the buyers. */}
            <Text className="text-[12px] leading-snug text-muted-light dark:text-muted-dark">
              {t('premium.terms', {
                period:
                  selected?.period === 'annual'
                    ? t('premium.periodYearly')
                    : t('premium.periodMonthly'),
              })}
            </Text>
          </View>
        ) : (
          <View className="gap-2 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
            <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
              {t('premium.appOnlyTitle')}
            </Text>
            <Text className="text-[13px] leading-snug text-ink2-light dark:text-ink2-dark">
              {t('premium.appOnlyBody')}
            </Text>
          </View>
        )}

        <View className="flex-row flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1">
          {sellable ? (
            <Pressable onPress={() => void handleRestore()} hitSlop={8} disabled={busy}>
              <Text className="text-[13px] font-semibold text-brand-500">
                {t('premium.restore')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() =>
              Linking.openURL(LEGAL_URL).catch(() =>
                toast.show(t('settings.legalFailed'), 'error'),
              )
            }
            hitSlop={8}
          >
            <Text className="text-[13px] font-semibold text-brand-500">
              {t('premium.legal')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Perk({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10">
        <Ionicons name={icon} size={15} color="#4B5FE0" />
      </View>
      <Text className="flex-1 text-[14px] leading-snug text-text-light dark:text-text-dark">
        {text}
      </Text>
    </View>
  );
}
