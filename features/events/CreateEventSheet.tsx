import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT, useTMaybe } from '@/i18n';
import { AddressField } from '@/components/events/AddressField';
import { EmojiPicker } from '@/components/events/EmojiPicker';
import { TagsField } from '@/components/events/TagsField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { useLocation } from '@/hooks/useLocation';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { eventSchema, type EventInput } from '@/utils/validators';
import type { LatLng } from '@/types';

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

const defaultValues: EventInput = {
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
  tags: [],
};

export function CreateEventSheet({
  open,
  onClose,
  pendingCoords,
  onCoordsChange,
  onRequestPickLocation,
}: Props) {
  const t = useT();
  const te = useTMaybe();
  const toast = useToast();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const iconColor = useIconColor();
  const upsertEvent = useEventsStore((s) => s.upsertEvent);
  const { coords: currentCoords, request } = useLocation();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventInput>({
    resolver: zodResolver(eventSchema),
    defaultValues,
  });

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

  const emoji = watch('emoji');
  const visibility = watch('visibility');
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const tags = watch('tags');

  const useCurrentLocation = async () => {
    await request();
    if (currentCoords) {
      setValue('latitude', currentCoords.latitude);
      setValue('longitude', currentCoords.longitude);
      // Coords no longer come from the address search — clear the stale
      // venue label rather than displaying an address the pin left.
      setValue('address', null);
      onCoordsChange(currentCoords);
      toast.show(t('createEvent.pinnedToLocation'), 'success');
    }
  };

  const onSubmit = async (values: EventInput) => {
    if (!session) return;
    if (!values.latitude || !values.longitude) {
      toast.show(t('createEvent.pickLocationFirst'), 'error');
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
        },
        participant_count: 1,
        is_joined: true,
      });
      toast.show(t('createEvent.created'), 'success');
      reset(defaultValues);
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('createEvent.failed'), 'error');
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.92} desktopRail>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Sticky header — always visible even as the form scrolls, so
            the user knows which sheet they're in and can bail out with
            the ×. Pad from the top by `insets.top` so the title clears
            the status bar / dynamic island — at heightPct=0.92 the
            sheet's top edge otherwise sits right under the notch. */}
        <View
          className="flex-row items-center justify-between border-b border-border-light pb-3 dark:border-border-dark"
          style={{ paddingTop: insets.top }}
        >
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

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 60, gap: 18, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label={t('createEvent.eventTitle')}
                placeholder={t('createEvent.titlePlaceholder')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={te(errors.title?.message)}
              />
            )}
          />

          <View>
            <Text className="mb-2 text-sm font-medium text-text-light dark:text-text-dark">
              {t('createEvent.emoji')}
            </Text>
            <EmojiPicker value={emoji} onChange={(v) => setValue('emoji', v)} />
          </View>

          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label={t('createEvent.description')}
                placeholder={t('createEvent.descriptionPlaceholder')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                error={te(errors.description?.message)}
              />
            )}
          />

          <TagsField
            value={tags}
            onChange={(next) => setValue('tags', next, { shouldValidate: true })}
            error={te(errors.tags?.message)}
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="event_date"
                render={({ field: { value, onChange } }) => (
                  <DateTimeField
                    mode="date"
                    label={t('createEvent.date')}
                    value={value}
                    onChange={onChange}
                    error={te(errors.event_date?.message)}
                  />
                )}
              />
            </View>
            <View className="flex-1">
              <Controller
                control={control}
                name="event_time"
                render={({ field: { value, onChange } }) => (
                  <DateTimeField
                    mode="time"
                    label={t('createEvent.time')}
                    value={value}
                    onChange={onChange}
                    error={te(errors.event_time?.message)}
                  />
                )}
              />
            </View>
          </View>

          {/* Location block ---------------------------------------------- */}
          <View>
            <Text className="mb-2 text-sm font-medium text-text-light dark:text-text-dark">
              {t('createEvent.location')}
            </Text>

            <View className="gap-3 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
              {/* State summary */}
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={latitude && longitude ? 'location' : 'location-outline'}
                  size={16}
                  color={latitude && longitude ? '#3757FF' : '#8E8E93'}
                />
                <Text className="flex-1 text-xs text-muted-light dark:text-muted-dark">
                  {latitude && longitude
                    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : t('createEvent.noPin')}
                </Text>
              </View>

              {/* Address search — also captures the human-readable venue
                  label so chats/peeks can show "Library" instead of raw
                  coordinates. */}
              <AddressField
                onSelect={(hit) => {
                  setValue('latitude', hit.coords.latitude);
                  setValue('longitude', hit.coords.longitude);
                  setValue('address', hit.label);
                  onCoordsChange(hit.coords);
                  toast.show(t('createEvent.pinnedToAddress'), 'success');
                }}
              />

              {/* Actions — stacked full-width so labels never wrap. Side-by-
                  side "Add new position" / "Current location" wrapped to
                  two lines each inside the 380px desktop rail. */}
              <View className="gap-2">
                <PrimaryButton
                  label={t('createEvent.pickOnMap')}
                  variant="secondary"
                  size="sm"
                  leftIcon={<Ionicons name="map" size={14} color="#3757FF" />}
                  onPress={onRequestPickLocation}
                  fullWidth
                />
                <PrimaryButton
                  label={t('createEvent.useMyLocation')}
                  variant="secondary"
                  size="sm"
                  leftIcon={<Ionicons name="navigate" size={14} color="#3757FF" />}
                  onPress={useCurrentLocation}
                  fullWidth
                />
              </View>

              <Text className="text-[11px] text-muted-light dark:text-muted-dark">
                {t('createEvent.longPressTip')}
              </Text>
            </View>

            {errors.latitude?.message || errors.longitude?.message ? (
              <Text className="mt-1.5 text-xs text-red-500">
                {te(errors.latitude?.message) ?? te(errors.longitude?.message)}
              </Text>
            ) : null}
          </View>

          <Controller
            control={control}
            name="max_participants"
            render={({ field: { value, onChange } }) => (
              <Input
                label={t('createEvent.maxParticipants')}
                keyboardType="number-pad"
                placeholder={t('createEvent.noCap')}
                value={value == null ? '' : String(value)}
                onChangeText={(t) => {
                  const n = Number(t.replace(/[^0-9]/g, ''));
                  onChange(Number.isFinite(n) && n > 0 ? n : null);
                }}
                error={te(errors.max_participants?.message)}
              />
            )}
          />

          <View className="flex-row items-center justify-between rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
                {t('createEvent.privateEvent')}
              </Text>
              <Text className="mt-1 text-xs text-muted-light dark:text-muted-dark">
                {t('createEvent.privateHint')}
              </Text>
            </View>
            <Switch
              value={visibility === 'private'}
              onValueChange={(v) => setValue('visibility', v ? 'private' : 'public')}
              trackColor={{ true: '#3757FF' }}
            />
          </View>

          <View className="flex-row gap-3 pt-2">
            <View className="flex-1">
              <PrimaryButton
                label={t('common.cancel')}
                variant="secondary"
                onPress={onClose}
                fullWidth
              />
            </View>
            <View className="flex-1">
              <PrimaryButton
                label={t('createEvent.submit')}
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                fullWidth
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
