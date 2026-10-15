import { zodResolver } from '@hookform/resolvers/zod';
import { friendlyError } from '@vybora/core';
import { signInSchema, type SignInInput } from '@vybora/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormError } from './AuthLayout';

export function LoginForm({ onSubmit }: { onSubmit: (values: SignInInput) => Promise<void> }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        try {
          await onSubmit(values);
        } catch (e) {
          setServerError(friendlyError(e));
        }
      })}
    >
      <FormError message={serverError} />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <div className="flex justify-end">
        <Link to="/forgot-password" className="text-sm font-semibold text-accent hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
