import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import { useT, useTMaybe } from '@/i18n';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { signUpSchema, type SignUpInput } from '@/utils/validators';

export default function SignUpScreen() {
  const t = useT();
  const te = useTMaybe();
  const toast = useToast();
  const iconColor = useIconColor();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', username: '', displayName: '' },
  });

  const onSubmit = async (values: SignUpInput) => {
    try {
      const { session } = await authService.signUp(values);
      if (session) {
        await setSession(session);
        router.replace('/(tabs)/map');
      } else {
        toast.show(t('auth.checkInbox'), 'success');
        router.replace('/(auth)/login');
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('auth.signUpFailed'), 'error');
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
          contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 24 }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.canGoBack() && router.back()}
              accessibilityLabel={t('common.back')}
              hitSlop={8}
            >
              <View className="flex-row items-center gap-1">
                <Ionicons name="chevron-back" size={14} color={iconColor} />
                <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark">
                  {t('common.back')}
                </Text>
              </View>
            </Pressable>
          </View>

          <View>
            <Text className="font-display text-5xl leading-[1.05] text-text-light dark:text-text-dark">
              {t('auth.setUpProfile')}
            </Text>
            <Text className="mt-3 text-sm text-muted-light">
              {t('auth.setUpSubtitle')}
            </Text>
          </View>

          <View className="gap-4">
            <Controller
              control={control}
              name="displayName"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label={t('auth.displayName')}
                  placeholder={t('auth.displayNamePlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={te(errors.displayName?.message)}
                />
              )}
            />
            <Controller
              control={control}
              name="username"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label={t('auth.username')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.usernamePlaceholder')}
                  leftAdornment={
                    <Text className="text-sm text-muted-light">@</Text>
                  }
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={te(errors.username?.message)}
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label={t('auth.email')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={te(errors.email?.message)}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label={t('auth.password')}
                  secureTextEntry={!showPassword}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={te(errors.password?.message)}
                  rightAdornment={
                    <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={6}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={16}
                        color="#8B8880"
                      />
                    </Pressable>
                  }
                />
              )}
            />
            {/* Date of birth. Asked here so someone too young is turned
                away before an account exists — but the form is not the
                enforcement: set_date_of_birth() is, and the answer
                reaches it through the one-time age screen, because
                signup returns no session when email confirmation is
                on. */}
            <Controller
              control={control}
              name="dateOfBirth"
              render={({ field: { value, onChange } }) => (
                <DateTimeField
                  mode="date"
                  label={t('auth.dateOfBirth')}
                  value={value ?? ''}
                  onChange={onChange}
                  error={te(errors.dateOfBirth?.message)}
                />
              )}
            />
          </View>

          <PrimaryButton
            label={t('common.continue')}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />

          <View className="mt-2 flex-row justify-center gap-1">
            <Text className="text-sm text-muted-light">{t('auth.haveAccount')}</Text>
            <Link
              href="/(auth)/login"
              className="text-sm font-semibold text-text-light dark:text-text-dark"
            >
              {t('auth.signInArrow')}
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
