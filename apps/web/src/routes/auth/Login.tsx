import { signIn } from '@vybora/api';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { LoginForm } from './LoginForm';
import { safeNext, withNext } from './next';

export { safeNext };

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your messages are decrypted only on your devices."
      footer={
        <>
          New to VYBORA?{' '}
          <Link
            to={withNext('/signup', next)}
            className="font-semibold text-accent hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm
        onSubmit={async (values) => {
          await signIn(supabase, values);
          navigate(safeNext(next), { replace: true });
        }}
      />
    </AuthLayout>
  );
}
