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

import { EmojiPicker } from '@/components/events/EmojiPicker';
import { TagsField } from '@/components/events/TagsField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { eventsService } from '@/services/events.service';
import { useEventsStore } from '@/store/events.store';
import { eventSchema, type EventInput } from '@/utils/validators';
import type { EventWithCreator } from '@/types';

type Props = {
  event: EventWithCreator | null;
  open: boolean;
  onClose: () => void;
};

export function EditEventSheet({ event, open, onClose }: Props) {
  const toast = useToast();
  const patchEvent = useEventsStore((s) => s.patchEvent);

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
      tags: event.tags ?? [],
    });
  }, [event, reset]);

  const emoji = watch('emoji');
  const visibility = watch('visibility');
  const tags = watch('tags');

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
        tags: values.tags,
      });
      patchEvent(event.id, updated);
      toast.show('Event updated.', 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update event', 'error');
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.9}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-row items-center justify-between border-b border-border-light pb-3 dark:border-border-dark">
          <Text className="text-2xl font-bold text-text-light dark:text-text-dark">
            Edit event
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
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 60, gap: 18, flexGrow: 1 }}
          showsVerticalScrollIndicator
        >
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Title"
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
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                error={errors.description?.message}
              />
            )}
          />

          <TagsField
            value={tags ?? []}
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

          <Controller
            control={control}
            name="max_participants"
            render={({ field: { value, onChange } }) => (
              <Input
                label="Maximum participants"
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
                Only you can see private events.
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
                label="Save changes"
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
