import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';

/** Deep link target for email verification: vybora://auth/callback?code=… (PKCE). */
export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [error, setError] = useState<string | null>(error_description ?? null);

  useEffect(() => {
    if (!code || error) {
      if (!code && !error) setError('This link is invalid or has expired.');
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => {
      if (e) setError('This link is invalid or has expired. Try logging in.');
      else router.replace('/');
    });
  }, [code, error]);

  if (!error) return <Loading label="Verifying" />;
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Empty
        icon="alert-circle"
        title="We couldn’t verify that link"
        body={error}
        action={<Button title="Go to log in" onPress={() => router.replace('/login')} />}
      />
    </View>
  );
}
