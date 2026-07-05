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
  placeholder = 'Search events, #tags, hosts',
  onSubmit,
}: Props) {
  return (
    <View
      className={[
        'h-11 flex-row items-center rounded-xl px-3.5',
        // Solid panel so the search bar stays readable on top of the
        // native Apple Maps / Google Maps tile mosaic. The /92 alpha
        // was rendering much lighter than intended on iOS.
        'bg-panel-light dark:bg-panel-dark',
        'border border-border-light dark:border-border-dark',
        'shadow-sm shadow-black/10',
      ].join(' ')}
    >
      <Ionicons name="search" size={16} color="#8B8880" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8B8880"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        className="ml-2 flex-1 text-[15px] text-text-light outline-none dark:text-text-dark"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear" hitSlop={8}>
          <Ionicons name="close-circle" size={16} color="#8B8880" />
        </Pressable>
      ) : null}
    </View>
  );
}
