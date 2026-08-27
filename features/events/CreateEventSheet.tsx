import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StepProgress } from '@/components/ui/StepProgress';
import { useToast } from '@/components/ui/Toast';
import { currentBcp47, useT } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import {
  eventsService,
  parseDailyLimitError,
  type EventQuota,
} from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { useModerationStore } from '@/store/moderation.store';
import { canRepeatEvents, canStylePin, dailyEventLimit } from '@/utils/roles';
import { eventSchema, type EventInput } from '@/utils/validators';
import type { LatLng } from '@/types';

import { StepBasics } from './create/StepBasics';
import { StepDetails } from './create/StepDetails';
import { StepFinish } from './create/StepFinish';
import { StepStyle } from './create/StepStyle';
import { StepWhen } from './create/StepWhen';
import { StepWhere } from './create/StepWhere';
import { buildSteps, stepIndex } from './create/types';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Wherever the pending marker currently sits on the map. */
  pendingCoords: LatLng | null;
  /** Bubble up an updated coord (from address search, current location, etc.)
   *  so the map's pending marker moves in sync. */
  onCoordsChange: (coords: LatLng | null) => void;
  /** Close the sheet and put the map in "next tap places the pin" mode. */
  onRequestPickLocation: () => void;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function roundedHourISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Built fresh on every reset rather than frozen at module load — the
 *  app can sit open past midnight, and a default date of "yesterday"
 *  produces an event that is filtered off the map the moment it exists. */
function makeDefaults(): EventInput {
  return {
    title: '',
    description: '',
    emoji: '🎉',
    latitude: 0,
    longitude: 0,
    address: null,
    event_date: todayISO(),
    event_time: roundedHourISO(),
    max_participants: null,
    visibility: 'public',
    pin_color: null,
    pin_effect: 'none',
    pin_effect_emoji: null,
    tags: [],
    repeat: 'none',
  };
}

/** When the next marker slot opens up. Day + time rather than a
 *  countdown: a rolling window can free up 23 hours from now, and
 *  "in 23 hours" is harder to act on than "tomorrow, 09:14". */
function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(currentBcp47(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Pin an event" — a five-step wizard rather than one long form.
 *
 *  The single-screen version asked for eleven fields at once and read as
 *  a chore; each step now asks one question (what / details / when /
 *  where / who), validates only its own fields, and the last one reads
 *  the whole thing back before it goes live.
 *
 *  Premium and staff accounts get a sixth step, Style, right after
 *  Basics — hence `buildSteps` rather than a module constant. Everyone
 *  else never sees it, and the DB drops the columns if they arrive from
 *  an account that isn't entitled.
 *
 *  Two bits of state deserve the explanation:
 *
 *  - `step` survives the sheet closing, because the location step can
 *    close it deliberately: "Pick on map" hands the map a tap handler
 *    and the map reopens us afterwards. `pickingRef` is how we tell that
 *    round trip apart from a real dismissal, which does reset.
 *  - The form is reset on genuine close. The parent already throws away
 *    `pendingCoords` there, so keeping half a draft around only meant
 *    reopening onto a stale title with no pin. */
export function CreateEventSheet({
  open,
  onClose,
  pendingCoords,
  onCoordsChange,
  onRequestPickLocation,
}: Props) {
  const t = useT();
  const toast = useToast();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const iconColor = useIconColor();
  const upsertEvent = useEventsStore((s) => s.upsertEvent);
  const role = useModerationStore((s) => s.role);
  const steps = buildSteps(canStylePin(role));
  const whereStep = stepIndex(steps, 'where');

  const [step, setStep] = useState(0);
  const [quota, setQuota] = useState<EventQuota | null>(null);
  const pickingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const form = useForm<EventInput>({
    resolver: zodResolver(eventSchema),
    defaultValues: makeDefaults(),
  });
  const {
    handleSubmit,
    reset,
    setValue,
    getValues,
    trigger,
    formState: { isSubmitting },
  } = form;

  // Sync the form's lat/lng with whatever pendingCoords the parent owns.
  useEffect(() => {
    if (!open) return;
    if (pendingCoords) {
      // If the parent moved the pin somewhere the form didn't already
      // point (map long-press / pick mode), the searched-address label
      // no longer describes the pin — drop it. When the sync comes from
      // the address search itself, coords are equal and the label stays.
      const moved =
        Math.abs((getValues('latitude') ?? 0) - pendingCoords.latitude) > 1e-9 ||
        Math.abs((getValues('longitude') ?? 0) - pendingCoords.longitude) > 1e-9;
      setValue('latitude', pendingCoords.latitude);
      setValue('longitude', pendingCoords.longitude);
      if (moved) setValue('address', null);
    }
  }, [open, pendingCoords, setValue, getValues]);

  // Clear the draft on a real dismissal, but not on the pick-on-map
  // round trip — see the component doc.
  useEffect(() => {
    if (open) {
      pickingRef.current = false;
      return;
    }
    if (pickingRef.current) return;
    reset(makeDefaults());
    setStep(0);
  }, [open, reset]);

  // How many markers are left in the rolling 24h window. Re-read on
  // every open rather than cached: the window slides, and the account
  // may have pinned from another device since.
  //
  // A failed call leaves `quota` null, which shows no counter and blocks
  // nothing — the DB trigger is the actual cap, so an offline device
  // should be refused by the server rather than by a fetch that didn't
  // land.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void eventsService.myQuota().then((q) => {
      if (alive) setQuota(q);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  // The moderation store refreshes in the background, so the wizard can
  // lose its Style step mid-flight if an admin revokes premium while the
  // sheet is open. Rare, but it would otherwise leave `step` pointing
  // past the end and the header reading "Step 6 of 5".
  useEffect(() => {
    setStep((s) => Math.min(s, steps.length - 1));
  }, [steps.length]);

  const goToStep = (next: number) => {
    setStep(next);
    // A step change is a new screen, not a scroll — jump, don't glide.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const current = steps[step] ?? steps[0]!;

  // null for staff (no cap) and while the quota call is in flight.
  const remaining =
    quota && quota.max !== null ? Math.max(0, quota.max - quota.used) : null;
  const atLimit = remaining === 0;

  const goNext = async () => {
    const ok = await trigger([...current.fields]);
    if (!ok) return;
    // zod can't catch this: (0, 0) is a perfectly valid coordinate, so
    // "never picked a location" has to be checked by hand.
    if (step === whereStep) {
      const { latitude, longitude } = getValues();
      if (!latitude || !longitude) {
        toast.show(t('createEvent.pickLocationFirst'), 'error');
        return;
      }
    }
    goToStep(Math.min(step + 1, steps.length - 1));
  };

  const goBack = () => goToStep(Math.max(step - 1, 0));

  const requestPickLocation = () => {
    // Tell the close effect this dismissal is ours, so the draft and the
    // current step survive the trip out to the map.
    pickingRef.current = true;
    onRequestPickLocation();
  };

  const onSubmit = async (values: EventInput) => {
    if (!session) return;
    if (!values.latitude || !values.longitude) {
      toast.show(t('createEvent.pickLocationFirst'), 'error');
      goToStep(whereStep);
      return;
    }
    try {
      const inserted = await eventsService.create({
        creator_id: session.user.id,
        title: values.title,
        description: values.description || null,
        emoji: values.emoji,
        latitude: values.latitude,
        longitude: values.longitude,
        address: values.address ?? null,
        event_date: values.event_date,
        event_time: values.event_time,
        max_participants: values.max_participants ?? null,
        visibility: values.visibility,
        pin_color: values.pin_color,
        pin_effect: values.pin_effect,
        pin_effect_emoji: values.pin_effect_emoji,
        tags: values.tags,
      });
      // Auto-join the creator — they're always attending their own event, and
      // seeing an active "Join" button for it in the preview was confusing.
      await eventsService.join(inserted.id, session.user.id);

      // Repeating is a second step on purpose: the event above is an
      // ordinary event in every respect, and this turns it into the
      // first of a series. Failing here must not lose the event they
      // just created, so it is reported and swallowed rather than
      // thrown — they still have their Wednesday, just not the rest.
      if (values.repeat !== 'none' && canRepeatEvents(role)) {
        try {
          await eventsService.setRepeat(inserted.id, values.repeat);
        } catch {
          toast.show(t('createEvent.repeatFailed'), 'error');
        }
      }

      upsertEvent({
        ...inserted,
        creator: {
          id: session.user.id,
          username:
            (session.user.user_metadata?.username as string | undefined) ?? 'you',
          display_name:
            (session.user.user_metadata?.display_name as string | undefined) ??
            'You',
          avatar_url:
            (session.user.user_metadata?.avatar_url as string | undefined) ?? null,
          // Carry the viewer's own role onto the optimistic stub, or
          // resolvePinStyle treats the creator as unentitled and the new
          // pin flashes plain until the realtime row arrives.
          role,
        },
        participant_count: 1,
        is_joined: true,
      });
      toast.show(t('createEvent.created'), 'success');
      reset(makeDefaults());
      setStep(0);
      onClose();
    } catch (e) {
      // The cap is enforced by a DB trigger, so it can fire even when the
      // pre-flight said there was room — two devices, or a window that
      // slid between the check and the insert. Swap the wizard for the
      // limit panel so the refusal is explained rather than just refused.
      const capped = parseDailyLimitError(e);
      if (capped) {
        setQuota({
          used: capped.limit,
          max: capped.limit,
          resetsAt: capped.resetsAt,
        });
        toast.show(
          t('createEvent.limitToast', { when: formatSlotTime(capped.resetsAt) }),
          'error',
        );
        return;
      }
      toast.show(e instanceof Error ? e.message : t('createEvent.failed'), 'error');
    }
  };

  const isLast = step === steps.length - 1;

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.92} desktopRail>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Sticky header — always visible even as the step scrolls, so
            the user knows where they are and can bail out with the ×.
            Pad from the top by `insets.top` so the title clears the
            status bar / dynamic island — at heightPct=0.92 the sheet's
            top edge otherwise sits right under the notch. */}
        <View
          className="gap-3 border-b border-border-light pb-3 dark:border-border-dark"
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-text-light dark:text-text-dark">
              {t('createEvent.title')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel={t('common.close')}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
            >
              <Ionicons name="close" size={18} color={iconColor} />
            </Pressable>
          </View>

          {atLimit ? null : (
            <StepProgress
              index={step}
              total={steps.length}
              label={t('createEvent.stepOf', { n: step + 1, total: steps.length })}
              stepName={t(current.name)}
              onJump={goToStep}
              jumpLabel={(n) => t('createEvent.goToStep', { n })}
            />
          )}

          {/* Only ever shown to a capped account with room left. Staff
              see nothing, and an account at zero gets the panel below
              instead of a counter reading "0 left". */}
          {remaining !== null && !atLimit && quota?.max != null ? (
            <Text className="text-xs text-muted-light dark:text-muted-dark">
              {t('createEvent.quotaLeft', {
                count: remaining,
                total: quota.max,
              })}
            </Text>
          ) : null}
        </View>

        {atLimit ? (
          <LimitPanel
            limit={quota?.max ?? 0}
            resetsAt={quota?.resetsAt ?? null}
            // Driven by the cap the server actually returned rather than
            // by the local role: the moderation store may not have
            // refreshed yet, and telling a subscriber to subscribe is
            // worse than saying nothing.
            showPremiumHint={
              quota?.max != null && quota.max < (dailyEventLimit('premium') ?? 0)
            }
            onClose={onClose}
          />
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingTop: 18, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Keyed off the step's id, not its index — the Style step
                  shifts every index after it by one. */}
              {current.id === 'basics' ? <StepBasics form={form} /> : null}
              {current.id === 'style' ? <StepStyle form={form} /> : null}
              {current.id === 'details' ? <StepDetails form={form} /> : null}
              {current.id === 'when' ? <StepWhen form={form} /> : null}
              {current.id === 'where' ? (
                <StepWhere
                  form={form}
                  onCoordsChange={onCoordsChange}
                  onRequestPickLocation={requestPickLocation}
                />
              ) : null}
              {current.id === 'finish' ? (
                <StepFinish form={form} steps={steps} onJump={goToStep} />
              ) : null}
            </ScrollView>

            {/* Docked footer — the primary action stays under the thumb no
                matter how long the step is. */}
            <View className="flex-row gap-3 border-t border-border-light pt-3 dark:border-border-dark">
              <View className="flex-1">
                <PrimaryButton
                  label={step === 0 ? t('common.cancel') : t('common.back')}
                  variant="secondary"
                  onPress={step === 0 ? onClose : goBack}
                  disabled={isSubmitting}
                  fullWidth
                />
              </View>
              <View className="flex-[1.4]">
                {isLast ? (
                  <PrimaryButton
                    label={t('createEvent.submit')}
                    variant="accent"
                    onPress={handleSubmit(onSubmit)}
                    loading={isSubmitting}
                    fullWidth
                  />
                ) : (
                  <PrimaryButton
                    label={t('common.continue')}
                    variant="accent"
                    onPress={goNext}
                    fullWidth
                  />
                )}
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

/** What the wizard turns into once the account has spent its markers for
 *  the window. It replaces the steps rather than sitting in front of
 *  them: there is nothing useful to fill in, and letting someone write a
 *  whole event only to be refused on the last screen is the version of
 *  this that generates support mail. */
function LimitPanel({
  limit,
  resetsAt,
  showPremiumHint,
  onClose,
}: {
  limit: number;
  resetsAt: string | null;
  showPremiumHint: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const premiumLimit = dailyEventLimit('premium');

  return (
    <View className="flex-1 justify-center gap-3 px-1 pb-4">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
        <Ionicons name="time-outline" size={24} color="#B45309" />
      </View>

      <Text className="text-xl font-bold text-text-light dark:text-text-dark">
        {t('createEvent.limitTitle')}
      </Text>

      <Text className="text-[15px] leading-snug text-ink2-light dark:text-ink2-dark">
        {t('createEvent.limitBody', { count: limit })}
      </Text>

      {resetsAt ? (
        <View className="gap-0.5 rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('createEvent.limitAgainAt')}
          </Text>
          <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
            {formatSlotTime(resetsAt)}
          </Text>
        </View>
      ) : null}

      {showPremiumHint && premiumLimit !== null ? (
        <Text className="text-[13px] leading-snug text-muted-light dark:text-muted-dark">
          {t('createEvent.limitPremium', { count: premiumLimit })}
        </Text>
      ) : null}

      <PrimaryButton
        label={t('common.close')}
        variant="secondary"
        onPress={onClose}
        fullWidth
        className="mt-2"
      />
    </View>
  );
}
