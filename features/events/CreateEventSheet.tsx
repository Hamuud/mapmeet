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

import { AddressField } from '@/components/events/AddressField';
import { EmojiPicker } from '@/components/events/EmojiPicker';
import { TagsField } from '@/components/events/TagsField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
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
  const toast = useToast();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const upsertEvent = useEventsStore((s) => s.upsertEvent);
  const { coords: currentCoords, request } = useLocation();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
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
      setValue('latitude', pendingCoords.latitude);
      setValue('longitude', pendingCoords.longitude);
    }
  }, [open, pendingCoords, setValue]);

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
      onCoordsChange(currentCoords);
      toast.show('Pinned to your location.', 'success');
    }
  };

  const onSubmit = async (values: EventInput) => {
    if (!session) return;
    if (!values.latitude || !values.longitude) {
      toast.show('Pick a location on the map first.', 'error');
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
      toast.show('Event pinned to the map.', 'success');
      reset(defaultValues);
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create event', 'error');
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
            Pin an event
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
          >
            <Ionicons name="close" size={18} color="#0E0E10" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 60, gap: 18, flexGrow: 1 }}
          showsVerticalScrollIndicator
        >
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Title"
                placeholder="e.g. Coffee & croissants"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.title?.message}
              />
            )}
          />

          <View>
            <Text className="mb-2 text-sm font-medium text-text-light dark:text-text-dark">
              Emoji
            </Text>
            <EmojiPicker value={emoji} onChange={(v) => setValue('emoji', v)} />
          </View>

          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Description"
                placeholder="Anything attendees should know."
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                error={errors.description?.message}
              />
            )}
          />

          <TagsField
            value={tags}
            onChange={(next) => setValue('tags', next, { shouldValidate: true })}
            error={errors.tags?.message}
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="event_date"
                render={({ field: { value, onChange } }) => (
                  <DateTimeField
                    mode="date"
                    label="Date"
                    value={value}
                    onChange={onChange}
                    error={errors.event_date?.message}
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
                    label="Time"
                    value={value}
                    onChange={onChange}
                    error={errors.event_time?.message}
                  />
                )}
              />
            </View>
          </View>

          {/* Location block ---------------------------------------------- */}
          <View>
            <Text className="mb-2 text-sm font-medium text-text-light dark:text-text-dark">
              Location
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
                    : 'No pin dropped yet'}
                </Text>
              </View>

              {/* Address search */}
              <AddressField
                onSelect={(hit) => {
                  setValue('latitude', hit.coords.latitude);
                  setValue('longitude', hit.coords.longitude);
                  onCoordsChange(hit.coords);
                  toast.show('Pinned to that address.', 'success');
                }}
              />

              {/* Actions — stacked full-width so labels never wrap. Side-by-
                  side "Add new position" / "Current location" wrapped to
                  two lines each inside the 380px desktop rail. */}
              <View className="gap-2">
                <PrimaryButton
                  label="Pick on map"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Ionicons name="map" size={14} color="#3757FF" />}
                  onPress={onRequestPickLocation}
                  fullWidth
                />
                <PrimaryButton
                  label="Use my location"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Ionicons name="navigate" size={14} color="#3757FF" />}
                  onPress={useCurrentLocation}
                  fullWidth
                />
              </View>

              <Text className="text-[11px] text-muted-light dark:text-muted-dark">
                Tip: long-press anywhere on the map to drop a pin without
                opening this sheet.
              </Text>
            </View>

            {errors.latitude?.message || errors.longitude?.message ? (
              <Text className="mt-1.5 text-xs text-red-500">
                {errors.latitude?.message ?? errors.longitude?.message}
              </Text>
            ) : null}
          </View>

          <Controller
            control={control}
            name="max_participants"
            render={({ field: { value, onChange } }) => (
              <Input
                label="Maximum participants (optional)"
                keyboardType="number-pad"
                placeholder="No cap"
                value={value == null ? '' : String(value)}
                onChangeText={(t) => {
                  const n = Number(t.replace(/[^0-9]/g, ''));
                  onChange(Number.isFinite(n) && n > 0 ? n : null);
                }}
                error={errors.max_participants?.message}
              />
            )}
          />

          <View className="flex-row items-center justify-between rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
                Private event
              </Text>
              <Text className="mt-1 text-xs text-muted-light dark:text-muted-dark">
                Only you can see private events. Share the link to invite others.
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
                label="Cancel"
                variant="secondary"
                onPress={onClose}
                fullWidth
              />
            </View>
            <View className="flex-1">
              <PrimaryButton
                label="Create event"
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
