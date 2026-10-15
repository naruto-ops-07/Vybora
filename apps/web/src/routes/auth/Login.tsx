import { signIn } from '@vybora/api';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { LoginForm } from './LoginForm';

/** Only allow same-origin relative redirects after login. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/messages';
  return next;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your messages are decrypted only on your devices."
      footer={
        <>
          New to VYBORA?{' '}
          <Link to="/signup" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm
        onSubmit={async (values) => {
          await signIn(supabase, values);
          navigate(safeNext(params.get('next')), { replace: true });
        }}
      />
    </AuthLayout>
  );
}
