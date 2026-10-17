import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { takeRememberedNext } from './next';

/**
 * Handles email-verification (and OAuth, when configured) redirects. With the
 * PKCE flow the URL carries a one-time `code` that supabase-js exchanges.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errDesc = params.get('error_description') ?? hash.get('error_description');
    if (errDesc) {
      setError(errDesc);
      return;
    }
    let cancelled = false;
    (async () => {
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        // detectSessionInUrl may have already exchanged the code.
        if (exchangeError) {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            if (!cancelled) setError('This link is invalid or has expired.');
            return;
          }
        }
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // Back from a sign-up confirmation: go where they were headed before signing up.
      if (data.session) navigate(takeRememberedNext(), { replace: true });
      else setError('This link is invalid or has expired.');
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!error) return <PageSpinner label="Verifying" />;
  return (
    <AuthLayout title="We couldn’t verify that link" subtitle={error}>
      <ButtonLink to="/login" fullWidth>
        Go to sign in
      </ButtonLink>
    </AuthLayout>
  );
}
