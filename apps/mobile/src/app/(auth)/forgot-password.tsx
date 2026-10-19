import { requestPasswordReset } from '@vybora/api';
import { resetRequestSchema } from '@vybora/validation';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Button, Empty, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function ForgotPassword() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setBusy(true);
    try {
      // Password is reset on the web (works on any device).
      await requestPasswordReset(supabase, parsed.data.email, `${siteUrl}/reset-password`);
    } finally {
      setBusy(false);
      setSent(true); // same response either way: avoids account enumeration
    }
  };

  return (
    <AuthScreen
      title="Reset your password"
      footer={
        <Link href="/login" style={{ color: t.accent, fontFamily: t.fonts.semibold }}>
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Empty
          icon="mail"
          title="Check your email"
          body="If an account exists for that email, a reset link is on its way."
        />
      ) : (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            error={error}
          />
          <Button title="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </AuthScreen>
  );
}
