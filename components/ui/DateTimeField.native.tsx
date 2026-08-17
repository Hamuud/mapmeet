import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

export type DateTimeFieldProps = {
  mode: 'date' | 'time';
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

function toDate(mode: 'date' | 'time', value: string): Date {
  if (mode === 'date') {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  }
  const [h, mi] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, mi ?? 0, 0, 0);
  return d;
}

function serialize(mode: 'date' | 'time', d: Date): string {
  if (mode === 'date') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function display(mode: 'date' | 'time', value: string): string {
  if (!value) return mode === 'date' ? 'Pick a date' : 'Pick a time';
  const d = toDate(mode, value);
  return mode === 'date'
    ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Native picker — on iOS it inlines a compact spinner, on Android it opens
 *  the system dialog once tapped. */
export function DateTimeField({ mode, label, value, onChange, error }: DateTimeFieldProps) {
  const [visible, setVisible] = useState(Platform.OS === 'ios');

  return (
    <View className="w-full">
      {/* Matches Input's label — mono, uppercase, 10px. See the note in
          the web twin. */}
      <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
        {label}
      </Text>
      <Pressable
        onPress={() => setVisible(true)}
        className={[
          'h-12 flex-row items-center rounded-2xl border px-4',
          'bg-elevated-light dark:bg-elevated-dark',
          error ? 'border-red-500' : 'border-border-light dark:border-border-dark',
        ].join(' ')}
      >
        <Text className="text-base text-text-light dark:text-text-dark">
          {display(mode, value)}
        </Text>
      </Pressable>

      {visible ? (
        <View className={Platform.OS === 'ios' ? 'mt-2' : ''}>
          <DateTimePicker
            value={toDate(mode, value || serialize(mode, new Date()))}
            mode={mode}
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, d) => {
              if (Platform.OS !== 'ios') setVisible(false);
              if (d) onChange(serialize(mode, d));
            }}
          />
        </View>
      ) : null}

      {error ? <Text className="mt-1.5 text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
