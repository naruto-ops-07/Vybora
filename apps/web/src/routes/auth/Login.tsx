import { sendSignInCode, signIn } from '@vybora/api';
import { codeCooldownLeft, markCodeSent, SIGN_IN_CODE_SENT } from '@vybora/core';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { EmailCodeStep } from './EmailCodeStep';
import { LoginForm, type LoginMode } from './LoginForm';
import { rememberNext, safeNext, takeRememberedNext, withNext } from './next';

export { safeNext };

/**
 * Router state from "That email already has an account" on sign-up: the email
 * travels here in history state, never in the URL.
 */
function arrival(state: unknown): { email: string; mode: LoginMode } {
  const s = (state ?? {}) as { email?: unknown; useCode?: unknown };
  return {
    email: typeof s.email === 'string' ? s.email : '',
    mode: s.useCode === true ? 'code' : 'password',
  };
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = params.get('next');
  // What the form starts with: router state on arrival, or the address coming
  // back from "Use a different email".
  const [form, setForm] = useState(() => arrival(location.state));
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const callbackUrl = `${siteUrl()}/auth/callback`;

  const footer = (
    <>
      New to VYBORA?{' '}
      <Link to={withNext('/signup', next)} className="font-semibold text-accent hover:underline">
        Create an account
      </Link>
    </>
  );

  if (codeEmail) {
    // The same screen whether or not the address has an account.
    return (
      <AuthLayout title="Enter the code" subtitle={SIGN_IN_CODE_SENT} footer={footer}>
        <p className="mb-5 text-sm text-muted">
          Signing in as{' '}
          <strong className="break-anywhere font-semibold text-ink">{codeEmail}</strong>
        </p>
        <EmailCodeStep
          key={codeEmail}
          email={codeEmail}
          purpose="signin"
          onVerified={() => {
            // Finished here rather than through the link: spend its remembered destination.
            takeRememberedNext(codeEmail);
            navigate(safeNext(next), { replace: true });
          }}
          onResend={() => sendSignInCode(supabase, codeEmail, callbackUrl)}
          onChangeEmail={() => {
            setForm({ email: codeEmail, mode: 'code' });
            setCodeEmail(null);
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your messages are decrypted only on your devices."
      footer={footer}
    >
      <LoginForm
        defaultEmail={form.email}
        defaultMode={form.mode}
        onSubmit={async (values) => {
          await signIn(supabase, values);
          navigate(safeNext(next), { replace: true });
        }}
        onSendCode={async (email) => {
          // Within a minute of the last code to this address, that code still
          // works and the wait carries on: show it instead of sending again.
          if (codeCooldownLeft('signin', email) === 0) {
            await sendSignInCode(supabase, email, callbackUrl);
            markCodeSent('signin', email);
          }
          // The link in the same email comes back through /auth/callback on this device.
          rememberNext(next, email);
          setCodeEmail(email);
        }}
      />
    </AuthLayout>
  );
}
