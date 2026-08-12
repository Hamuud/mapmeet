import { Pressable, Text, View } from 'react-native';

type Props = {
  /** 0-based index of the step being shown. */
  index: number;
  total: number;
  /** Already-translated "Step 2 of 5". */
  label: string;
  /** Already-translated name of the current step ("Details"). */
  stepName: string;
  /** Jump back to an earlier, already-completed step. Segments ahead of
   *  `index` are never tappable — the wizard validates as it goes, so
   *  skipping forward would land the user on a step whose prerequisites
   *  are still empty. */
  onJump?: (index: number) => void;
  /** Builds the accessibility label for a segment, 1-based. */
  jumpLabel?: (step: number) => string;
};

/** Segmented "Step N of M" header for multi-step forms.
 *
 *  Coral fill: the accent is reserved app-wide for the create-event
 *  path, and this bar only ever appears inside it. */
export function StepProgress({
  index,
  total,
  label,
  stepName,
  onJump,
  jumpLabel,
}: Props) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light dark:text-muted-dark">
          {label}
        </Text>
        <Text className="font-mono text-[10px] uppercase tracking-wider text-accent-400">
          {stepName}
        </Text>
      </View>

      <View className="flex-row gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const filled = i <= index;
          const canJump = !!onJump && i < index;
          return (
            <Pressable
              key={i}
              disabled={!canJump}
              onPress={canJump ? () => onJump(i) : undefined}
              // The bar itself is 4pt tall; without vertical slop it is
              // effectively untappable on a phone.
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole={canJump ? 'button' : undefined}
              accessibilityLabel={canJump ? jumpLabel?.(i + 1) : undefined}
              className="flex-1"
            >
              <View
                className={[
                  'h-1 w-full rounded-full',
                  filled
                    ? 'bg-accent-400'
                    : 'bg-border-light dark:bg-border-dark',
                ].join(' ')}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
