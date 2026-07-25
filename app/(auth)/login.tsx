import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useLocalSearchParams } from 'expo-router';
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

import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useIconColor } from '@/hooks/useIconColor';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { signInSchema, type SignInInput } from '@/utils/validators';

export default function LoginScreen() {
  const toast = useToast();
  const iconColor = useIconColor();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  // Set when the user lands here from the confirm-email link
  // (emailRedirectTo → /login?confirmed=1). Drives the success banner.
  const { confirmed } = useLocalSearchParams<{ confirmed?: string }>();
  const justConfirmed = confirmed === '1';
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: SignInInput) => {
    try {
      const session = await authService.signIn(values);
      await setSession(session);
      router.replace('/(tabs)/map');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Sign in failed', 'error');
    }
  };

  const oauthComingSoon = () =>
    toast.show('OAuth providers land in the next update.', 'info');

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
          {/* Back arrow — for symmetry with the redesign, even though the
              root layout swallows the pop when there's no history. */}
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.canGoBack() && router.back()}
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <View className="flex-row items-center gap-1">
                <Ionicons name="chevron-back" size={14} color={iconColor} />
                <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light dark:text-text-dark">
                  Back
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Monogram */}
          <View className="mt-2">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-text-light dark:bg-text-dark">
              <Text className="font-display text-2xl text-surface-light dark:text-surface-dark">
                M
              </Text>
            </View>
          </View>

          {/* Display title */}
          <View>
            <Text className="font-display text-5xl leading-[1.05] text-text-light dark:text-text-dark">
              Welcome{'\n'}back.
            </Text>
            <Text className="mt-3 text-sm text-muted-light">
              Sign in to meet friends on the map today.
            </Text>
          </View>

          {/* Email-confirmed banner — shown after the confirm-email link
              lands the user back here. */}
          {justConfirmed ? (
            <View className="flex-row items-center gap-2.5 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3">
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              <Text className="flex-1 text-sm font-medium text-green-700 dark:text-green-400">
                Your email is confirmed. Sign in to start using MapMeet.
              </Text>
            </View>
          ) : null}

          {/* Form */}
          <View className="gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  placeholder="you@example.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                />
              )}
            />
            <View>
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
                  Password
                </Text>
                <Link href="/(auth)/forgot-password" className="text-xs text-text-light dark:text-text-dark">
                  Forgot?
                </Link>
              </View>
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    textContentType="password"
                    placeholder="••••••••"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.password?.message}
                    rightAdornment={
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={6}
                      >
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
            </View>
          </View>

          {/* Primary action */}
          <PrimaryButton
            label="Sign in"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />

          {/* Divider */}
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border-light dark:bg-border-dark" />
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              or
            </Text>
            <View className="h-px flex-1 bg-border-light dark:bg-border-dark" />
          </View>

          {/* OAuth ghosts — placeholders until we wire them up. */}
          <View className="gap-3">
            <PrimaryButton
              label="Continue with Google"
              variant="secondary"
              onPress={oauthComingSoon}
              leftIcon={<Ionicons name="logo-google" size={14} color={iconColor} />}
              fullWidth
            />
            <PrimaryButton
              label="Continue with Apple"
              variant="secondary"
              onPress={oauthComingSoon}
              leftIcon={<Ionicons name="logo-apple" size={16} color={iconColor} />}
              fullWidth
            />
          </View>

          <View className="mt-2 flex-row justify-center gap-1">
            <Text className="text-sm text-muted-light">New here?</Text>
            <Link href="/(auth)/signup" className="text-sm font-semibold text-text-light dark:text-text-dark">
              Create an account →
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
