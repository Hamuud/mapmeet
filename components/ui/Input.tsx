import { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';
import { Platform, Text, TextInput, View } from 'react-native';

type Props = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
};

/** Input primitive.
 *
 *  Two layouts:
 *   - single-line: fixed 44pt row with `items-center`, so the placeholder
 *     sits vertically centered and left-aligned.
 *   - multiline: min-height 88pt with the TextInput top-aligned. Previously
 *     the multiline field was jammed into the same 44pt row, which
 *     visually clipped the placeholder above the border on iOS and
 *     made typed text jump around as it wrapped.
 */
export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    helperText,
    error,
    leftAdornment,
    rightAdornment,
    multiline,
    numberOfLines,
    className,
    style,
    ...rest
  },
  ref,
) {
  return (
    <View className="w-full">
      {label ? (
        <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
          {label}
        </Text>
      ) : null}
      <View
        className={[
          multiline
            ? 'min-h-[88px] flex-row items-start rounded-xl border px-4 py-3'
            : 'h-11 flex-row items-center rounded-xl border px-4',
          'bg-panel-light dark:bg-panel-dark',
          error
            ? 'border-red-500'
            : 'border-border-light dark:border-border-dark',
        ].join(' ')}
      >
        {leftAdornment ? (
          <View className={multiline ? 'mr-2 pt-0.5' : 'mr-2'}>
            {leftAdornment}
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor="#8B8880"
          multiline={multiline}
          numberOfLines={numberOfLines ?? (multiline ? 3 : undefined)}
          // Android needs this explicitly for multiline; iOS ignores it.
          textAlignVertical={multiline ? 'top' : 'center'}
          className={[
            'flex-1 text-[15px] text-text-light dark:text-text-dark',
            'outline-none',
            className ?? '',
          ].join(' ')}
          style={[
            // Web ships `line-height: normal` which crops descenders inside a
            // 44pt row on iOS Safari; explicit line-height fixes the
            // "placeholder sits above the border" bug.
            Platform.OS === 'web'
              ? multiline
                ? { lineHeight: 22, paddingVertical: 0 }
                : { lineHeight: 20, paddingVertical: 0 }
              : null,
            style,
          ]}
          {...rest}
        />
        {rightAdornment ? (
          <View className={multiline ? 'ml-2 pt-0.5' : 'ml-2'}>
            {rightAdornment}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text className="mt-1.5 text-xs text-red-500">{error}</Text>
      ) : helperText ? (
        <Text className="mt-1.5 text-xs text-muted-light dark:text-muted-dark">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});
