import { isUsernameAvailable, resendConfirmation, signUp } from '@vybora/api';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { SignupForm } from './SignupForm';

export default function Signup() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const checkUsername = useCallback((u: string) => isUsernameAvailable(supabase, u), []);

  if (pendingEmail) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={
          <>
            We sent a confirmation link to <strong>{pendingEmail}</strong>.
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line text-accent">
            <EnvelopeSimpleIcon size={24} aria-hidden="true" />
          </div>
          <p className="text-sm text-muted">
            Open the link on this device to finish creating your account.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await resendConfirmation(supabase, pendingEmail, `${siteUrl()}/auth/callback`);
                toast.show('Confirmation email sent again', 'success');
              } catch {
                toast.show('Please wait a moment before resending', 'error');
              }
            }}
          >
            Resend email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Private messaging with end-to-end encryption."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm
        checkUsername={checkUsername}
        onSubmit={async (values) => {
          const result = await signUp(supabase, values, `${siteUrl()}/auth/callback`);
          if (result.status === 'already_registered') throw new Error('User already registered');
          if (result.status === 'signed_in') navigate('/messages', { replace: true });
          else setPendingEmail(values.email);
        }}
      />
    </AuthLayout>
  );
}
