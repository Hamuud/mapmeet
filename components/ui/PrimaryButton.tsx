import { forwardRef } from 'react';
import type { PressableProps, View } from 'react-native';
import { ActivityIndicator, Pressable, Text } from 'react-native';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  fullWidth?: boolean;
};

// ── Design system ────────────────────────────────────────────────────
// primary  = ink-on-paper (default action)
// accent   = coral (ONE accent, reserved for "create event")
// secondary= subtle chip / panel button
// ghost    = borderless text button
// destructive = red action
const container: Record<Variant, string> = {
  primary:     'bg-text-light dark:bg-text-dark active:opacity-90',
  accent:      'bg-accent-400 active:bg-accent-500',
  secondary:   'bg-panel-light dark:bg-panel-dark border border-border-light dark:border-border-dark active:opacity-80',
  ghost:       'bg-transparent active:opacity-60',
  destructive: 'bg-red-600 active:bg-red-700',
};

const text: Record<Variant, string> = {
  primary:     'text-surface-light dark:text-surface-dark',
  accent:      'text-white',
  secondary:   'text-text-light dark:text-text-dark',
  ghost:       'text-text-light dark:text-text-dark',
  destructive: 'text-white',
};

const sizing: Record<Size, string> = {
  sm: 'h-9 px-3 rounded-xl',
  md: 'h-11 px-5 rounded-xl',
  lg: 'h-14 px-6 rounded-2xl',
};

const labelSize: Record<Size, string> = {
  sm: 'text-sm font-semibold',
  md: 'text-[15px] font-semibold',
  lg: 'text-lg font-semibold',
};

export const PrimaryButton = forwardRef<View, Props>(function PrimaryButton(
  {
    label,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    leftIcon,
    fullWidth,
    className,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const spinnerColor =
    variant === 'secondary' || variant === 'ghost' ? '#4B5FE0' : '#fff';
  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      accessibilityRole="button"
      className={[
        'flex-row items-center justify-center',
        sizing[size],
        container[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50' : '',
        className ?? '',
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text className={[labelSize[size], text[variant], leftIcon ? 'ml-2' : ''].join(' ')}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
});
