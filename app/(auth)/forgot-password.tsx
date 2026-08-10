import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT, useTMaybe } from '@/i18n';
import { authService } from '@/services/auth.service';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/utils/validators';

export default function ForgotPasswordScreen() {
  const t = useT();
  const te = useTMaybe();
  const toast = useToast();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }: ForgotPasswordInput) => {
    try {
      await authService.requestPasswordReset(email);
      toast.show(t('auth.resetLinkSent'), 'success');
      reset();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('auth.resetLinkFailed'), 'error');
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
              {t('auth.resetTitle')}
            </Text>
            <Text className="mt-2 text-base text-muted-light dark:text-muted-dark">
              {t('auth.resetSubtitle')}
            </Text>
          </View>

          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label={t('auth.email')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('auth.emailPlaceholder')}
                leftAdornment={<Ionicons name="mail-outline" size={16} color="#8E8E93" />}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={te(errors.email?.message)}
              />
            )}
          />

          <PrimaryButton
            label={t('auth.sendResetLink')}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />

          <View className="flex-row justify-center gap-1 pt-2">
            <Text className="text-sm text-muted-light dark:text-muted-dark">
              {t('auth.rememberedIt')}
            </Text>
            <Link href="/(auth)/login" className="text-sm font-semibold text-brand-500">
              {t('auth.backToSignIn')}
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
