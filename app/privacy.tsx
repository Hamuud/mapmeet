import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useIconColor } from '@/hooks/useIconColor';
import { profilesService } from '@/services/profiles.service';
import { useAuthStore } from '@/store/auth.store';
import { goBack } from '@/utils/nav';

type AttendingVisibility = 'nobody' | 'friends' | 'everyone';
const ATTENDING_VIS: {
  value: AttendingVisibility;
  label: string;
  hint: string;
}[] = [
  { value: 'nobody', label: 'Nobody', hint: 'Only you can see them' },
  { value: 'friends', label: 'Friends only', hint: "Only people you're friends with" },
  { value: 'everyone', label: 'Everyone', hint: 'Anyone who views your profile' },
];

/** Privacy settings. For now just the "who can see the events I'm
 *  attending" control; more toggles land here over time. */
export default function PrivacyScreen() {
  const toast = useToast();
  const iconColor = useIconColor();
  const { profile } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);
  const attendingVisibility: AttendingVisibility =
    profile?.attending_visibility ?? 'everyone';

  const setAttendingVisibility = async (value: AttendingVisibility) => {
    if (!profile || value === attendingVisibility) return;
    const previous = profile;
    setProfile({ ...profile, attending_visibility: value }); // optimistic
    try {
      await profilesService.setAttendingVisibility(value);
    } catch (e) {
      setProfile(previous);
      toast.show(e instanceof Error ? e.message : 'Could not update', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-2.5 border-b border-border-light px-3 py-3 dark:border-border-dark">
        <Pressable
          onPress={() => goBack('/settings')}
          accessibilityLabel="Back"
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-elevated-light dark:bg-elevated-dark"
        >
          <Ionicons name="chevron-back" size={18} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-bold text-text-light dark:text-text-dark">
          Privacy
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          <View>
            <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
              Who can see the events I'm attending?
            </Text>
            <Text className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">
              Controls who can see the events you've joined on your profile.
            </Text>
          </View>

          <View className="gap-2">
            {ATTENDING_VIS.map((opt) => {
              const active = attendingVisibility === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => void setAttendingVisibility(opt.value)}
                  className={[
                    'flex-row items-center gap-3 rounded-2xl border px-4 py-3',
                    active
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-border-light bg-panel-light dark:border-border-dark dark:bg-panel-dark',
                  ].join(' ')}
                >
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-text-light dark:text-text-dark">
                      {opt.label}
                    </Text>
                    <Text className="text-xs text-muted-light dark:text-muted-dark">
                      {opt.hint}
                    </Text>
                  </View>
                  <View
                    className={[
                      'h-5 w-5 items-center justify-center rounded-full border-2',
                      active ? 'border-brand-500' : 'border-muted-light',
                    ].join(' ')}
                  >
                    {active ? <View className="h-2.5 w-2.5 rounded-full bg-brand-500" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
