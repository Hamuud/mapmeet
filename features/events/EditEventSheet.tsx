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
import { EmojiPicker } from '@/components/events/EmojiPicker';
import { PinStyleField } from '@/components/events/PinStyleField';
import { TagsField } from '@/components/events/TagsField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import { MapMarker } from '@/components/map/MapMarker';
import { resolveColorValue } from '@/features/events/pinStyle';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { useModerationStore } from '@/store/moderation.store';
import { useScrollLockStore } from '@/store/scrollLock.store';
import { canStylePin, canStylePinFreeform } from '@/utils/roles';
import { eventSchema, type EventInput } from '@/utils/validators';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator | null;
  open: boolean;
  onClose: () => void;
};

export function EditEventSheet({ event, open, onClose }: Props) {
  const t = useT();
  const scrollLocked = useScrollLockStore((s) => s.locked);
  const te = useTMaybe();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const iconColor = useIconColor();
  const patchEvent = useEventsStore((s) => s.patchEvent);
  const role = useModerationStore((s) => s.role);
  const canStyle = canStylePin(role);
  const freeform = canStylePinFreeform(role);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventInput>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      description: '',
      emoji: '🎉',
      latitude: 0,
      longitude: 0,
      event_date: '',
      event_time: '',
      max_participants: null,
      visibility: 'public',
      pin_color: null,
      pin_effect: 'none',
      pin_effect_emoji: null,
      tags: [],
    },
  });

  useEffect(() => {
    if (!event) return;
    reset({
      title: event.title,
      description: event.description ?? '',
      emoji: event.emoji,
      latitude: event.latitude,
      longitude: event.longitude,
      event_date: event.event_date,
      event_time: event.event_time.slice(0, 5),
      max_participants: event.max_participants,
      visibility: event.visibility,
      pin_color: event.pin_color ?? null,
      pin_effect: event.pin_effect ?? 'none',
      pin_effect_emoji: event.pin_effect_emoji ?? null,
      tags: event.tags ?? [],
    });
  }, [event, reset]);

  const emoji = watch('emoji');
  const visibility = watch('visibility');
  const tags = watch('tags');
  const pinColor = watch('pin_color');
  const pinEffect = watch('pin_effect') ?? 'none';
  const pinGlyphs = watch('pin_effect_emoji') ?? null;

  const onSubmit = async (values: EventInput) => {
    if (!event) return;
    try {
      const updated = await eventsService.update(event.id, {
        title: values.title,
        description: values.description || null,
        emoji: values.emoji,
        latitude: values.latitude,
        longitude: values.longitude,
        event_date: values.event_date,
        event_time: values.event_time,
        max_participants: values.max_participants ?? null,
        visibility: values.visibility,
        pin_color: values.pin_color,
        pin_effect: values.pin_effect,
        pin_effect_emoji: values.pin_effect_emoji,
        tags: values.tags,
      });
      patchEvent(event.id, updated);
      toast.show(t('editEvent.saved'), 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('editEvent.failed'), 'error');
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.9} desktopRail>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View
          className="flex-row items-center justify-between border-b border-border-light pb-3 dark:border-border-dark"
          style={{ paddingTop: insets.top }}
        >
          <Text className="text-2xl font-bold text-text-light dark:text-text-dark">
            {t('editEvent.title')}
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
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 60, gap: 18, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          // Same as the create sheet: the colour picker's square is a
          // vertical drag, and iOS scrolls natively without deferring to
          // the responder that already owns the gesture.
          scrollEnabled={!scrollLocked}
        >
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label={t('createEvent.eventTitle')}
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
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                error={te(errors.description?.message)}
              />
            )}
          />

          <TagsField
            value={tags ?? []}
            onChange={(next) => setValue('tags', next, { shouldValidate: true })}
            error={te(errors.tags?.message)}
          />

          {/* Premium pin styling. Edit isn't a wizard, so it gets the
              same controls as the create flow's Style step in a plain
              block — otherwise a subscriber could pick a colour once and
              never change it. Hidden entirely for anyone unentitled, and
              the DB preserves the stored values if premium has lapsed. */}
          {canStyle ? (
            <View className="gap-3 rounded-2xl border border-border-light bg-elevated-light p-4 dark:border-border-dark dark:bg-elevated-dark">
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles" size={14} color="#D98C00" />
                <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
                  {t('pinStyle.title')}
                </Text>
              </View>
              <View className="items-center py-1">
                <View style={{ maxWidth: 240 }}>
                  <MapMarker
                    emoji={emoji || '❓'}
                    isPrivate={visibility === 'private'}
                    pinColor={resolveColorValue(pinColor, freeform)}
                    pinEffect={pinEffect}
                    pinGlyphs={pinGlyphs}
                    compact
                  />
                </View>
              </View>
              <PinStyleField
                color={pinColor}
                effect={pinEffect}
                glyphs={pinGlyphs}
                freeform={freeform}
                onColorChange={(v) => setValue('pin_color', v, { shouldDirty: true })}
                onEffectChange={(v) => setValue('pin_effect', v, { shouldDirty: true })}
                onGlyphsChange={(v) =>
                  setValue('pin_effect_emoji', v, { shouldDirty: true })
                }
              />
            </View>
          ) : null}

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
                label={t('editEvent.submit')}
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
