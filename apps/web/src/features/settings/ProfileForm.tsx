import { zodResolver } from '@hookform/resolvers/zod';
import { friendlyError } from '@vybora/core';
import { LIMITS, profileUpdateSchema, type ProfileUpdateInput } from '@vybora/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { FormError } from '@/routes/auth/AuthLayout';

export interface ProfileFormValues {
  username: string;
  display_name: string;
  bio: string;
  website: string;
}

export function ProfileForm({
  initial,
  onSubmit,
}: {
  initial: ProfileFormValues;
  onSubmit: (v: ProfileUpdateInput) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileUpdateSchema) as never,
    defaultValues: initial,
  });
  const bio = watch('bio') ?? '';

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        try {
          await onSubmit(values as unknown as ProfileUpdateInput);
        } catch (e) {
          setError(friendlyError(e));
        }
      })}
    >
      <FormError message={error} />
      <Input
        label="Username"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.username?.message}
        {...register('username')}
      />
      <Input
        label="Display name"
        maxLength={LIMITS.displayName}
        error={errors.display_name?.message}
        {...register('display_name')}
      />
      <Textarea
        label="Bio"
        rows={4}
        value={bio}
        error={errors.bio?.message}
        {...register('bio')}
        max={LIMITS.bio}
      />
      <Input
        label="Website"
        type="url"
        inputMode="url"
        placeholder="yourwebsite.com"
        error={errors.website?.message}
        {...register('website')}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
