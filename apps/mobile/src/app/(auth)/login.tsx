import { signIn } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { signInSchema } from '@vybora/validation';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen, FormError } from '@/features/auth/AuthScreen';
import { logDevError } from '@/lib/devLog';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setServerError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signIn(supabase, parsed.data); // the auth layout redirects on session change
    } catch (e) {
      logDevError('sign-in', e);
      setServerError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Your messages are decrypted only on your devices."
      footer={
        <Text variant="muted">
          New to VYBORA?{' '}
          <Link href="/signup" style={{ color: t.accent, fontFamily: font.semibold }}>
            Create an account
          </Link>
        </Text>
      }
    >
      <FormError message={serverError} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        error={errors.password}
        onSubmitEditing={submit}
      />
      <Link
        href="/forgot-password"
        style={{ color: t.accent, fontFamily: font.semibold, alignSelf: 'flex-end' }}
      >
        Forgot password?
      </Link>
      <Button title="Sign in" onPress={submit} loading={busy} />
    </AuthScreen>
  );
}
