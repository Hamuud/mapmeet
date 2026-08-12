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
import { useT } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { useModerationStore } from '@/store/moderation.store';
import { canStylePin } from '@/utils/roles';
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
    tags: [],
  };
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
        tags: values.tags,
      });
      // Auto-join the creator — they're always attending their own event, and
      // seeing an active "Join" button for it in the preview was confusing.
      await eventsService.join(inserted.id, session.user.id);

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

          <StepProgress
            index={step}
            total={steps.length}
            label={t('createEvent.stepOf', { n: step + 1, total: steps.length })}
            stepName={t(current.name)}
            onJump={goToStep}
            jumpLabel={(n) => t('createEvent.goToStep', { n })}
          />
        </View>

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
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
