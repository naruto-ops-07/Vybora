import { zodResolver } from '@hookform/resolvers/zod';
import { EMAIL_CODE_LENGTH, emailCodeError, friendlyError } from '@vybora/core';
import { emailSchema, signInSchema, type SignInInput } from '@vybora/validation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormError } from './AuthLayout';
import { logDevError } from '@/lib/devLog';

export type LoginMode = 'password' | 'code';

export interface LoginFormProps {
  onSubmit: (values: SignInInput) => Promise<void>;
  /** Offers "Email me a code instead"; resolves once a code has been asked for. */
  onSendCode?: (email: string) => Promise<void>;
  defaultEmail?: string;
  defaultMode?: LoginMode;
}

const codeRequestSchema = z.object({ email: emailSchema });
type CodeRequest = z.infer<typeof codeRequestSchema>;

/** Password sign-in (the default) or, when offered, a request for an emailed code. */
export function LoginForm({
  onSubmit,
  onSendCode,
  defaultEmail = '',
  defaultMode = 'password',
}: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode>(defaultMode);
  // The address carries across a switch, so it is never typed twice.
  const [email, setEmail] = useState(defaultEmail);
  const [switched, setSwitched] = useState(false);
  const switchTo = (next: LoginMode) => (current: string) => {
    setEmail(current);
    setSwitched(true);
    setMode(next);
  };

  if (mode === 'code' && onSendCode) {
    return (
      <CodeRequestForm
        defaultEmail={email}
        // Focus follows a switch; an address handed over (or coming back from
        // "Use a different email") is selected, ready to send or to retype.
        focus={switched ? 'caret' : email ? 'select' : null}
        onSendCode={onSendCode}
        onUsePassword={switchTo('password')}
      />
    );
  }
  return (
    <PasswordForm
      defaultEmail={email}
      autoFocus={switched || !!email}
      onSubmit={onSubmit}
      onUseCode={onSendCode ? switchTo('code') : undefined}
    />
  );
}

function PasswordForm({
  defaultEmail,
  autoFocus,
  onSubmit,
  onUseCode,
}: {
  defaultEmail: string;
  autoFocus: boolean;
  onSubmit: LoginFormProps['onSubmit'];
  onUseCode?: (email: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: defaultEmail, password: '' },
  });

  // On arrival only: these never change while the form is up.
  useEffect(() => {
    if (autoFocus) setFocus(getValues('email') ? 'password' : 'email');
  }, [autoFocus, getValues, setFocus]);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        try {
          await onSubmit(values);
        } catch (e) {
          logDevError('sign-in', e);
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
      <div className="space-y-2">
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Sign in
        </Button>
        {onUseCode && (
          <Button
            variant="ghost"
            fullWidth
            className="touch-target"
            disabled={isSubmitting}
            onClick={() => onUseCode(getValues('email'))}
          >
            Email me a code instead
          </Button>
        )}
      </div>
    </form>
  );
}

function CodeRequestForm({
  defaultEmail,
  focus,
  onSendCode,
  onUsePassword,
}: {
  defaultEmail: string;
  focus: 'caret' | 'select' | null;
  onSendCode: (email: string) => Promise<void>;
  onUsePassword: (email: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CodeRequest>({
    resolver: zodResolver(codeRequestSchema),
    defaultValues: { email: defaultEmail },
  });

  // On arrival only: these never change while the form is up.
  useEffect(() => {
    if (focus) setFocus('email', { shouldSelect: focus === 'select' });
  }, [focus, setFocus]);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        try {
          await onSendCode(values.email);
        } catch (e) {
          logDevError('sign-in code', e);
          setServerError(emailCodeError(e));
        }
      })}
    >
      <FormError message={serverError} />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        hint={`We’ll email you a ${EMAIL_CODE_LENGTH}-digit code to sign in.`}
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="space-y-2">
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Send code
        </Button>
        <Button
          variant="ghost"
          fullWidth
          className="touch-target"
          disabled={isSubmitting}
          onClick={() => onUsePassword(getValues('email'))}
        >
          Use password instead
        </Button>
      </div>
    </form>
  );
}
