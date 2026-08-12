import { Text, View } from 'react-native';

type Props = {
  title: string;
  hint: string;
};

/** Every wizard step opens with the same two lines: a serif question and
 *  one sentence of context. Splitting the form across screens only helps
 *  if each screen says plainly what it wants. */
export function StepHeading({ title, hint }: Props) {
  return (
    <View className="gap-1.5">
      <Text className="font-display text-[28px] leading-tight text-text-light dark:text-text-dark">
        {title}
      </Text>
      <Text className="text-[13px] leading-snug text-muted-light dark:text-muted-dark">
        {hint}
      </Text>
    </View>
  );
}
