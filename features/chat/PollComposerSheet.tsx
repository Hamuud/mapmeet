import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Create the poll. Options are already trimmed + non-empty, ≥2. */
  onCreate: (question: string, options: string[], anonymous: boolean) => Promise<void>;
};

const MIN_OPTIONS = 2;

/** Compose a poll: a question, an unlimited list of answer options (start
 *  with two, add/remove freely), and an anonymous toggle. The server
 *  re-validates and enforces the ≥2 rule. */
export function PollComposerSheet({ open, onClose, onCreate }: Props) {
  const t = useT();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset each time the sheet opens.
  useEffect(() => {
    if (open) {
      setQuestion('');
      setOptions(['', '']);
      setAnonymous(false);
      setBusy(false);
    }
  }, [open]);

  const setOption = (i: number, value: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));

  const addOption = () => setOptions((prev) => [...prev, '']);

  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, idx) => idx !== i)));

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && cleaned.length >= MIN_OPTIONS;

  const handleCreate = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    try {
      await onCreate(question.trim(), cleaned, anonymous);
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('poll.createFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.9} autoHeight>
      <View className="gap-4 pb-2">
        <View className="flex-row items-center gap-2">
          <Ionicons name="stats-chart" size={18} color="#4B5FE0" />
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            {t('poll.newPoll')}
          </Text>
        </View>

        {/* Question */}
        <View className="gap-1.5">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('poll.question')}
          </Text>
          <View className="rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder={t('poll.questionPlaceholder')}
              placeholderTextColor="#8B8880"
              maxLength={200}
              multiline
              className="text-[15px] text-text-light outline-none dark:text-text-dark"
            />
          </View>
        </View>

        {/* Options */}
        <View className="gap-1.5">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
            {t('poll.options')}
          </Text>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            <View className="gap-2">
              {options.map((opt, i) => (
                <View key={i} className="flex-row items-center gap-2">
                  <View className="h-11 flex-1 justify-center rounded-2xl border border-border-light bg-elevated-light px-4 dark:border-border-dark dark:bg-elevated-dark">
                    <TextInput
                      value={opt}
                      onChangeText={(v) => setOption(i, v)}
                      placeholder={t('poll.optionN', { n: i + 1 })}
                      placeholderTextColor="#8B8880"
                      maxLength={100}
                      className="text-[15px] text-text-light outline-none dark:text-text-dark"
                    />
                  </View>
                  {options.length > MIN_OPTIONS ? (
                    <Pressable
                      onPress={() => removeOption(i)}
                      hitSlop={6}
                      accessibilityLabel={t('poll.removeOption', { n: i + 1 })}
                      className="h-9 w-9 items-center justify-center rounded-full"
                    >
                      <Ionicons name="close-circle" size={20} color="#8B8880" />
                    </Pressable>
                  ) : (
                    <View className="h-9 w-9" />
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
          <Pressable
            onPress={addOption}
            className="mt-1 flex-row items-center gap-1.5 self-start rounded-full bg-brand-500/10 px-3 py-1.5 active:opacity-70"
          >
            <Ionicons name="add" size={15} color="#4B5FE0" />
            <Text className="text-[13px] font-semibold text-brand-500">Add option</Text>
          </Pressable>
        </View>

        {/* Anonymous toggle */}
        <View className="flex-row items-center justify-between rounded-2xl border border-border-light bg-panel-light px-4 py-3 dark:border-border-dark dark:bg-panel-dark">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-text-light dark:text-text-dark">
              {t('poll.anonymous')}
            </Text>
            <Text className="text-xs text-muted-light">
              {t('poll.anonymousHint')}
            </Text>
          </View>
          <Switch
            value={anonymous}
            onValueChange={setAnonymous}
            trackColor={{ false: '#C9C6BE', true: '#4B5FE0' }}
            thumbColor="#fff"
          />
        </View>

        <PrimaryButton
          label={t('poll.create')}
          loading={busy}
          disabled={!canCreate}
          onPress={handleCreate}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
