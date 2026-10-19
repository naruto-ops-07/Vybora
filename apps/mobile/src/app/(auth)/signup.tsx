import { isUsernameAvailable, resendConfirmation, signUp } from '@vybora/api';
import { codeCooldownLeft, EMAIL_CODE_LENGTH, friendlyError, markCodeSent } from '@vybora/core';
import { emailSchema, signUpSchema } from '@vybora/validation';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen, AuthTextButton, FormError, Strong } from '@/features/auth/AuthScreen';
import { authCallbackUrl } from '@/features/auth/callbackUrl';
import { EmailCodeStep } from '@/features/auth/EmailCodeStep';
import { handOffToLogin } from '@/features/auth/loginHandoff';
import { logDevError } from '@/lib/devLog';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Stage =
  { step: 'form' } | { step: 'code'; email: string } | { step: 'registered'; email: string };

export default function Signup() {
  const t = useTheme();
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    'idle',
  );
  const [busy, setBusy] = useState(false);
  // One sign-up at a time: a fast double tap can land before the busy state renders.
  const inFlight = useRef(false);
  const [stage, setStage] = useState<Stage>({ step: 'form' });
  // Only "Use a different email" puts the keyboard back on the address. It is
  // read when the form mounts, so nothing during a submit can move focus.
  const [focusEmail, setFocusEmail] = useState(false);
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

  /** Back to the form with the email (and display name) kept. */
  const backToForm = ({ keepUsername }: { keepUsername: boolean }) => {
    // After a code was sent, the username is held by the unconfirmed account,
    // so offering it again would only say "taken". A password is never kept.
    setForm((f) => ({ ...f, username: keepUsername ? f.username : '', password: '' }));
    setErrors({});
    setServerError(null);
    setFocusEmail(true);
    setStage({ step: 'form' });
  };

  const submit = async () => {
    if (inFlight.current) return;
    setServerError(null);
    // Within a minute of the last code to this address, that code still works
    // and the account is already waiting for it: go back instead of signing up again.
    const address = emailSchema.safeParse(form.email);
    if (address.success && codeCooldownLeft('signup', address.data) > 0) {
      setErrors({});
      setStage({ step: 'code', email: address.data });
      return;
    }
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
    inFlight.current = true;
    setBusy(true);
    try {
      const { email } = parsed.data;
      const result = await signUp(supabase, form, authCallbackUrl());
      if (result.status === 'already_registered') setStage({ step: 'registered', email });
      else if (result.status === 'confirm_email') {
        markCodeSent('signup', email);
        setStage({ step: 'code', email });
      }
      // signed_in: the auth layout redirects on the session change.
    } catch (e) {
      logDevError('signup', e);
      setServerError(friendlyError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (stage.step === 'code') {
    const { email } = stage;
    return (
      <AuthScreen
        title="Enter the code"
        subtitle={
          <>
            {`We sent a ${EMAIL_CODE_LENGTH}-digit code to `}
            <Strong>{email}</Strong>.
          </>
        }
        footer={
          <Text variant="muted" style={{ textAlign: 'center' }}>
            You can also open the link in the email on this device.
          </Text>
        }
      >
        <EmailCodeStep
          key={email}
          email={email}
          purpose="signup"
          onResend={() => resendConfirmation(supabase, email, authCallbackUrl())}
          onChangeEmail={() => backToForm({ keepUsername: false })}
        />
      </AuthScreen>
    );
  }

  if (stage.step === 'registered') {
    const { email } = stage;
    // The address rides along in memory, never in the route (see loginHandoff).
    const openLogin = (useCode: boolean) => {
      handOffToLogin({ email, useCode });
      router.push('/login');
    };
    return (
      <AuthScreen
        title="That email already has an account"
        subtitle={
          <>
            Sign in as <Strong>{email}</Strong> instead.
          </>
        }
      >
        <Button title="Sign in with a code" onPress={() => openLogin(true)} />
        <Button title="Sign in with password" variant="outline" onPress={() => openLogin(false)} />
        <AuthTextButton
          label="Use a different email"
          tone="muted"
          // Nothing was created for this address, so the username is still free to use.
          onPress={() => backToForm({ keepUsername: true })}
        />
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
          <Link href="/login" style={{ color: t.accent, fontFamily: t.fonts.semibold }}>
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
        autoFocus={focusEmail}
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
