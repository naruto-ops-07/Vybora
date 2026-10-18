import { sendSignInCode, signIn } from '@vybora/api';
import { EMAIL_CODE_LENGTH, emailCodeError, friendlyError, SIGN_IN_CODE_SENT } from '@vybora/core';
import { emailSchema, signInSchema } from '@vybora/validation';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen, FormError, Strong } from '@/features/auth/AuthScreen';
import { codeCooldownLeft, markCodeSent } from '@/features/auth/codeCooldown';
import { EmailCodeStep } from '@/features/auth/EmailCodeStep';
import { takeLoginHandoff } from '@/features/auth/loginHandoff';
import { logDevError } from '@/lib/devLog';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

type Mode = 'password' | 'code';

// The link in the same email is a fallback to typing the code.
const callbackUrl = () => Linking.createURL('/auth/callback');

export default function Login() {
  const t = useTheme();
  // From "That email already has an account" on sign-up: in memory, never in the route.
  const [arrival] = useState(takeLoginHandoff);
  const [mode, setMode] = useState<Mode>(arrival?.useCode ? 'code' : 'password');
  const [email, setEmail] = useState(arrival?.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  // Focus is set only by arriving or coming back, and read when a field mounts:
  // nothing during a submit can move it. Only "Use a different email" puts the
  // keyboard back on the address; arriving to type a password starts there.
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPassword, setFocusPassword] = useState(() => !!arrival && !arrival.useCode);

  const switchTo = (next: Mode) => {
    setMode(next);
    setErrors({});
    setServerError(null);
    setFocusPassword(false);
  };

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

  const sendCode = async () => {
    setServerError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? 'Enter a valid email address' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const address = parsed.data;
      // Within a minute of the last code to this address, that code still works
      // and the wait carries on: show it instead of sending again.
      if (codeCooldownLeft('signin', address) === 0) {
        await sendSignInCode(supabase, address, callbackUrl());
        markCodeSent('signin', address);
      }
      // The same screen whether or not the address has an account.
      setCodeEmail(address);
    } catch (e) {
      logDevError('sign-in code', e);
      setServerError(emailCodeError(e));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <Text variant="muted">
      New to VYBORA?{' '}
      <Link href="/signup" style={{ color: t.accent, fontFamily: font.semibold }}>
        Create an account
      </Link>
    </Text>
  );

  if (codeEmail) {
    return (
      <AuthScreen title="Enter the code" subtitle={SIGN_IN_CODE_SENT} footer={footer}>
        <Text variant="muted">
          Signing in as <Strong>{codeEmail}</Strong>
        </Text>
        <EmailCodeStep
          key={codeEmail}
          email={codeEmail}
          purpose="signin"
          onResend={() => sendSignInCode(supabase, codeEmail, callbackUrl())}
          onChangeEmail={() => {
            setEmail(codeEmail);
            setMode('code');
            setFocusEmail(true);
            setCodeEmail(null);
          }}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Your messages are decrypted only on your devices."
      footer={footer}
    >
      <FormError message={serverError} />
      {/* One email field for both ways in: switching keeps it, its text and its focus. */}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoFocus={focusEmail}
        error={errors.email}
        hint={
          mode === 'code'
            ? `We’ll email you a ${EMAIL_CODE_LENGTH}-digit code to sign in.`
            : undefined
        }
        returnKeyType={mode === 'code' ? 'send' : undefined}
        onSubmitEditing={mode === 'code' ? sendCode : undefined}
      />
      {mode === 'password' ? (
        <>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoFocus={focusPassword}
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
          <Button
            title="Email me a code instead"
            variant="ghost"
            disabled={busy}
            onPress={() => switchTo('code')}
          />
        </>
      ) : (
        <>
          <Button title="Send code" onPress={sendCode} loading={busy} />
          <Button
            title="Use password instead"
            variant="ghost"
            disabled={busy}
            onPress={() => switchTo('password')}
          />
        </>
      )}
    </AuthScreen>
  );
}
