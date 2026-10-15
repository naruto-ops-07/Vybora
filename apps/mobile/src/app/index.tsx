import { Redirect } from 'expo-router';
import { Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

/** Entry: chats when signed in, otherwise sign in. */
export default function Index() {
  const { session } = useAuth();
  if (session === undefined) return <Loading label="Restoring your session" />;
  return <Redirect href={session ? '/messages' : '/login'} />;
}
