import { isUsernameAvailable, signUp } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { signUpSchema } from '@vybora/validation';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, Empty, Text, TextField } from '@/components/ui';
import { AuthScreen, FormError } from '@/features/auth/AuthScreen';
import { logDevError } from '@/lib/devLog';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

export default function Signup() {
  const t = useTheme();
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    'idle',
  );
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const parsed = signUpSchema.shape.username.safeParse(form.username);
    if (!parsed.success) return setAvailability('idle');
    setAvailability('checking');
    let cancelled = false;
    const timer = setTimeout(() => {
      isUsernameAvailable(supabase, parsed.data).then(
        (ok) => !cancelled && setAvailability(ok ? 'available' : 'taken'),
        () => !cancelled && setAvailability('idle'),
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.username]);

  const submit = async () => {
    setServerError(null);
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success || availability === 'taken') {
      const errs = parsed.success
        ? {}
        : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
      if (availability === 'taken') errs.username = 'That username is taken';
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // Email links open the app via the vybora:// scheme (must be allow-listed in Supabase Auth).
      const result = await signUp(supabase, form, Linking.createURL('/auth/callback'));
      if (result.status === 'already_registered')
        setServerError('An account with this email already exists.');
      else if (result.status === 'confirm_email') setSentTo(form.email);
    } catch (e) {
      logDevError('signup', e);
      setServerError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthScreen title="Check your inbox">
        <Empty
          icon="mail"
          title="Confirm your email"
          body={`We sent a link to ${sentTo}. Open it on this device to finish signing up.`}
        />
        <Link href="/login" style={{ color: t.accent, fontWeight: '700', textAlign: 'center' }}>
          Back to sign in
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Private messaging with end-to-end encryption."
      footer={
        <Text variant="muted">
          Already have an account?{' '}
          <Link href="/login" style={{ color: t.accent, fontFamily: font.semibold }}>
            Sign in
          </Link>
        </Text>
      }
    >
      <FormError message={serverError} />
      <TextField
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={errors.email}
      />
      <TextField
        label="Username"
        value={form.username}
        onChangeText={set('username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        error={errors.username ?? (availability === 'taken' ? 'That username is taken' : undefined)}
        hint={
          availability === 'available'
            ? 'Available'
            : availability === 'checking'
              ? 'Checking…'
              : 'Letters, numbers, periods and underscores'
        }
      />
      <TextField
        label="Display name"
        value={form.displayName}
        onChangeText={set('displayName')}
        autoComplete="name"
      />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        hint="At least 8 characters with a letter and a number"
        error={errors.password}
      />
      <Button title="Create account" onPress={submit} loading={busy} />
    </AuthScreen>
  );
}
