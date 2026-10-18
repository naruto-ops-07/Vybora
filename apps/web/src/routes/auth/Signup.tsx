import { isUsernameAvailable, resendConfirmation, signUp } from '@vybora/api';
import { EMAIL_CODE_LENGTH } from '@vybora/core';
import type { SignUpInput } from '@vybora/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { codeCooldownLeft, markCodeSent } from './codeCooldown';
import { EmailCodeStep } from './EmailCodeStep';
import { rememberNext, safeNext, takeRememberedNext, withNext } from './next';
import { SignupForm } from './SignupForm';

type Stage =
  { step: 'form' } | { step: 'code'; email: string } | { step: 'registered'; email: string };

export default function Signup() {
  const navigate = useNavigate();
  // Where they were headed (e.g. a friend's add link): honoured once they're in.
  const [params] = useSearchParams();
  const next = params.get('next');
  const [stage, setStage] = useState<Stage>({ step: 'form' });
  // The last values sent, and what "Use a different email" seeds the form with.
  // Seeding happens only on the way back, never during a submit: a re-render
  // mid-request must not move focus or select the address.
  const submitted = useRef<Partial<SignUpInput>>({});
  const [kept, setKept] = useState<Partial<SignUpInput>>({});
  const checkUsername = useCallback((u: string) => isUsernameAvailable(supabase, u), []);
  const callbackUrl = `${siteUrl()}/auth/callback`;
  const backToForm = () => {
    setKept(submitted.current);
    setStage({ step: 'form' });
  };

  if (stage.step === 'code') {
    const { email } = stage;
    return (
      <AuthLayout
        title="Enter the code"
        subtitle={
          <>
            We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
            <strong className="break-anywhere font-semibold text-ink">{email}</strong>.
          </>
        }
        footer="You can also open the link in the email on this device."
      >
        <EmailCodeStep
          key={email}
          email={email}
          purpose="signup"
          onVerified={() => {
            // Finished here rather than through the link: spend its remembered destination.
            takeRememberedNext(email);
            navigate(safeNext(next), { replace: true });
          }}
          onResend={() => resendConfirmation(supabase, email, callbackUrl)}
          onChangeEmail={backToForm}
        />
      </AuthLayout>
    );
  }

  if (stage.step === 'registered') {
    return <AlreadyRegistered email={stage.email} next={next} onChangeEmail={backToForm} />;
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Private messaging with end-to-end encryption."
      footer={
        <>
          Already have an account?{' '}
          <Link to={withNext('/login', next)} className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm
        checkUsername={checkUsername}
        defaultValues={kept}
        onSubmit={async (values) => {
          const { email } = values;
          submitted.current = { email, displayName: values.displayName };
          // Within a minute of the last code to this address, that code still
          // works and the wait carries on: go back to it instead of sending again.
          if (codeCooldownLeft('signup', email) === 0) {
            const result = await signUp(supabase, values, callbackUrl);
            if (result.status === 'signed_in') {
              navigate(safeNext(next), { replace: true });
              return;
            }
            if (result.status === 'already_registered') {
              setStage({ step: 'registered', email });
              return;
            }
            markCodeSent('signup', email);
          }
          // The link in the same email comes back through /auth/callback on this device.
          rememberNext(next, email);
          setStage({ step: 'code', email });
        }}
      />
    </AuthLayout>
  );
}

function AlreadyRegistered({
  email,
  next,
  onChangeEmail,
}: {
  email: string;
  next: string | null;
  onChangeEmail: () => void;
}) {
  // The form that was submitted is gone: start on the likeliest next step.
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const to = withNext('/login', next);

  return (
    <AuthLayout
      title="That email already has an account"
      subtitle={
        <>
          Sign in as <strong className="break-anywhere font-semibold text-ink">{email}</strong>{' '}
          instead.
        </>
      }
    >
      <div className="space-y-3">
        {/* The email rides in router state, never in the URL. */}
        <ButtonLink ref={first} to={to} state={{ email, useCode: true }} size="lg" fullWidth>
          Sign in with a code
        </ButtonLink>
        <ButtonLink to={to} state={{ email }} variant="outline" size="lg" fullWidth>
          Sign in with password
        </ButtonLink>
        <Button
          variant="ghost"
          fullWidth
          className="touch-target text-muted hover:text-ink"
          onClick={onChangeEmail}
        >
          Use a different email
        </Button>
      </div>
    </AuthLayout>
  );
}
