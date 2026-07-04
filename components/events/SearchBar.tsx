import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search events, #tags, creators',
  onSubmit,
}: Props) {
  return (
    <View
      className={[
        'h-11 flex-row items-center rounded-2xl px-3',
        'bg-white/85 dark:bg-elevated-dark/85',
        'border border-border-light dark:border-border-dark',
      ].join(' ')}
    >
      <Ionicons name="search" size={16} color="#8E8E93" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8E8E93"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        className="ml-2 flex-1 text-sm text-text-light outline-none dark:text-text-dark"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={16} color="#8E8E93" />
        </Pressable>
      ) : null}
    </View>
  );
}
