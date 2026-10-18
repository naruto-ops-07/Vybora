import { zodResolver } from '@hookform/resolvers/zod';
import { friendlyError } from '@vybora/core';
import { signUpSchema, type SignUpInput } from '@vybora/validation';
import { AtIcon, CheckIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormError } from './AuthLayout';

export interface SignupFormProps {
  onSubmit: (values: SignUpInput) => Promise<void>;
  checkUsername: (username: string) => Promise<boolean>;
  /** Values to start from, e.g. the email kept by "Use a different email". */
  defaultValues?: Partial<SignUpInput>;
}

export function SignupForm({ onSubmit, checkUsername, defaultValues }: SignupFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    'idle',
  );
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', username: '', displayName: '', ...defaultValues },
    mode: 'onBlur',
  });

  // Back from the code step to change the address: it's selected, ready to retype.
  const returning = !!defaultValues?.email;
  useEffect(() => {
    if (returning) setFocus('email', { shouldSelect: true });
  }, [returning, setFocus]);

  const username = watch('username');
  useEffect(() => {
    const parsed = signUpSchema.shape.username.safeParse(username);
    if (!parsed.success) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const ok = await checkUsername(parsed.data);
        if (!cancelled) setAvailability(ok ? 'available' : 'taken');
      } catch {
        if (!cancelled) setAvailability('idle');
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, checkUsername]);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        if (availability === 'taken') {
          setError('username', { message: 'That username is taken' });
          return;
        }
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
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        leading={<AtIcon size={16} />}
        error={
          errors.username?.message ??
          (availability === 'taken' ? 'That username is taken' : undefined)
        }
        hint={
          availability === 'available' ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon size={14} /> Available
            </span>
          ) : availability === 'checking' ? (
            'Checking…'
          ) : (
            'Letters, numbers, periods and underscores'
          )
        }
        {...register('username')}
      />
      <Input
        label="Display name"
        autoComplete="name"
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters with a letter and a number"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-xs text-subtle">
        By continuing you agree to use VYBORA respectfully and lawfully.
      </p>
    </form>
  );
}
