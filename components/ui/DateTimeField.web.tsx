import { useColorScheme } from 'nativewind';
import { Text, View } from 'react-native';

export type DateTimeFieldProps = {
  mode: 'date' | 'time';
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Web uses the native HTML picker. Text color + colorScheme follow the
 *  app's effective theme (NativeWind's `useColorScheme`, driven by the
 *  Light/Dark/Auto toggle in Settings) instead of the raw OS setting,
 *  so a user who forced Light doesn't get white-on-white text just
 *  because their OS is in dark mode. */
export function DateTimeField({ mode, label, value, onChange, error }: DateTimeFieldProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#F5F5F7' : '#0B0B0F';

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
            color: textColor,
            colorScheme: isDark ? 'dark' : 'light',
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
