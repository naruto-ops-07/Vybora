import { zodResolver } from '@hookform/resolvers/zod';
import { requestPasswordReset } from '@vybora/api';
import { resetRequestSchema } from '@vybora/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(resetRequestSchema) });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        sent
          ? 'If an account exists for that email, a reset link is on its way.'
          : 'We’ll email you a secure link.'
      }
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!sent && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            // Always show the same confirmation to avoid account enumeration.
            try {
              await requestPasswordReset(supabase, email, `${siteUrl()}/reset-password`);
            } finally {
              setSent(true);
            }
          })}
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
