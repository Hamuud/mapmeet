import { Text, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';

type Props = {
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ emoji, title, description, actionLabel, onAction }: Props) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Explicit lineHeight > fontSize: Tailwind's text-5xl sets a
          48/48 line box and iOS Text clips glyph ink above it — emoji
          draw taller than the em box, so 📍 etc. lost their tops. */}
      {emoji ? (
        <Text className="mb-3" style={{ fontSize: 48, lineHeight: 62 }}>
          {emoji}
        </Text>
      ) : null}
      <Text className="text-center text-lg font-semibold text-text-light dark:text-text-dark">
        {title}
      </Text>
      {description ? (
        <Text className="mt-2 text-center text-sm text-muted-light dark:text-muted-dark">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          className="mt-6"
        />
      ) : null}
    </View>
  );
}
