import { zodResolver } from '@hookform/resolvers/zod';
import { updatePassword } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { newPasswordSchema } from '@vybora/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { AuthLayout, FormError } from './AuthLayout';

export default function ResetPassword() {
  const { session, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(newPasswordSchema) });

  if (session === undefined) return <PageSpinner />;
  if (!session) {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is invalid or has expired.">
        <ButtonLink to="/forgot-password" fullWidth>
          Request a new link
        </ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ password }) => {
          setError(null);
          try {
            await updatePassword(supabase, password);
            clearPasswordRecovery();
            toast.show('Password updated', 'success');
            navigate('/messages', { replace: true });
          } catch (e) {
            setError(friendlyError(e));
          }
        })}
      >
        <FormError message={error} />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
