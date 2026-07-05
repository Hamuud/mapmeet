import { Text, View } from 'react-native';

/** Design-system tag. Matches the redesign's `.tag` component: mono
 *  uppercase, 10px, tight tracking, 6px radius, panel-tinted background.
 *  Used for meta pills — dates, distances, "PRIVATE", "HOST", etc. */
type Tone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'private'
  | 'success'
  | 'warning'
  | 'brand'; // alias of `primary` — kept for backward compat

const bg: Record<Tone, string> = {
  neutral: 'bg-elevated-light dark:bg-elevated-dark',
  primary: 'bg-brand-100',
  brand:   'bg-brand-100',
  accent:  'bg-accent-100',
  private: 'bg-accent-100',
  success: 'bg-emerald-100',
  warning: 'bg-orange-100',
};

const text: Record<Tone, string> = {
  neutral: 'text-ink2-light dark:text-ink2-dark',
  primary: 'text-brand-700',
  brand:   'text-brand-700',
  accent:  'text-accent-700',
  private: 'text-accent-700',
  success: 'text-emerald-700',
  warning: 'text-orange-700',
};

type Props = {
  label: string;
  tone?: Tone;
  icon?: React.ReactNode;
};

export function Badge({ label, tone: t = 'neutral', icon }: Props) {
  return (
    <View
      className={[
        'flex-row items-center gap-1 rounded-md px-2 py-0.5',
        bg[t],
      ].join(' ')}
    >
      {icon}
      <Text
        className={[
          'font-mono text-[10px] uppercase tracking-wider',
          text[t],
        ].join(' ')}
      >
        {label}
      </Text>
    </View>
  );
}
