import { Text, View } from 'react-native';

export type DateTimeFieldProps = {
  mode: 'date' | 'time';
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Web uses the native HTML picker.
 *
 *  Text color used to key off `useColorScheme()` — which reads the OS's
 *  `prefers-color-scheme`. That mismatched the actual rendered theme:
 *  Tailwind is set to `darkMode: 'class'` (not `media`), so the field's
 *  background stays light regardless of OS. On an OS-dark user, the OS
 *  reported "dark" and the input text turned near-white — invisible
 *  against the still-light input background.
 *
 *  Until dark mode is wired end-to-end via the preferences store, pin
 *  text + color-scheme to light. That matches the app's actual palette
 *  everywhere the input is rendered right now. */
export function DateTimeField({ mode, label, value, onChange, error }: DateTimeFieldProps) {
  return (
    <View className="w-full">
      <Text className="mb-1.5 text-sm font-medium text-text-light dark:text-text-dark">
        {label}
      </Text>
      <View
        className={[
          'h-12 justify-center rounded-2xl border px-4',
          'bg-elevated-light dark:bg-elevated-dark',
          error ? 'border-red-500' : 'border-border-light dark:border-border-dark',
        ].join(' ')}
      >
        <input
          type={mode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#0B0B0F',
            colorScheme: 'light',
            fontSize: 16,
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
      </View>
      {error ? <Text className="mt-1.5 text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
