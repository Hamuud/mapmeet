import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });

type Form = z.infer<typeof schema>;

/** Reached from the Supabase recovery email. useDeepLinkSession has
 *  already restored the recovery session by the time we mount — so the
 *  user just needs to pick a new password. */
export default function ResetScreen() {
  const toast = useToast();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = async ({ password }: Form) => {
    try {
      await authService.updatePassword(password);
      toast.show('Password updated. You are signed in.', 'success');
      router.replace('/(tabs)/map');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update password', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20 }}
        >
          <View className="mt-6">
            <Text className="text-4xl font-bold text-text-light dark:text-text-dark">
              New password
            </Text>
            <Text className="mt-2 text-base text-muted-light dark:text-muted-dark">
              Choose something you haven't used elsewhere.
            </Text>
          </View>

          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="New password"
                secureTextEntry
                placeholder="At least 8 characters"
                leftAdornment={
                  <Ionicons name="lock-closed-outline" size={16} color="#8E8E93" />
                }
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="confirm"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Confirm password"
                secureTextEntry
                placeholder="Retype the same password"
                leftAdornment={
                  <Ionicons name="lock-closed-outline" size={16} color="#8E8E93" />
                }
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.confirm?.message}
              />
            )}
          />

          <PrimaryButton
            label="Update password"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
