import { Text, useColorScheme, View } from 'react-native';

export type DateTimeFieldProps = {
  mode: 'date' | 'time';
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Web uses the native HTML picker. `color-scheme` tells the browser to
 *  paint the picker chrome (icons, spinners) with the right palette, and
 *  we set `color` explicitly because react-native-web's parent styles
 *  don't cascade through to a raw <input>. Without that the selected
 *  value renders as white-on-white in light mode and vice versa. */
export function DateTimeField({ mode, label, value, onChange, error }: DateTimeFieldProps) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
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
