import {
  emailCodeSchema,
  emailSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from '@vybora/validation';
import { unwrap, type VyboraClient } from './client';

export type SignUpResult =
  { status: 'confirm_email' } | { status: 'signed_in' } | { status: 'already_registered' };

export async function isUsernameAvailable(
  client: VyboraClient,
  username: string,
): Promise<boolean> {
  return unwrap(await client.rpc('username_available', { p_username: username })) as boolean;
}

/**
 * Email + password sign-up. The profile row is created server-side by the
 * `on_auth_user_created` trigger from the metadata below.
 */
export async function signUp(
  client: VyboraClient,
  input: SignUpInput,
  emailRedirectTo?: string,
): Promise<SignUpResult> {
  const parsed = signUpSchema.parse(input);
  const { data, error } = await client.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      emailRedirectTo,
      data: { username: parsed.username, display_name: parsed.displayName },
    },
  });
  if (error) {
    if (/already registered/i.test(error.message)) return { status: 'already_registered' };
    throw error;
  }
  // With email confirmation enabled, Supabase returns a user with no
  // identities for an existing email instead of an error (anti-enumeration).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { status: 'already_registered' };
  }
  return data.session ? { status: 'signed_in' } : { status: 'confirm_email' };
}

export async function signIn(client: VyboraClient, input: SignInInput) {
  const { data, error } = await client.auth.signInWithPassword(input);
  if (error) throw error;
  return data.session;
}

export async function signOut(client: VyboraClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(
  client: VyboraClient,
  email: string,
  redirectTo?: string,
) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(client: VyboraClient, password: string) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function resendConfirmation(
  client: VyboraClient,
  email: string,
  emailRedirectTo?: string,
) {
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo },
  });
  if (error) throw error;
}

/**
 * Email the user a 6-digit sign-in code. Never creates an account, and stays
 * silent when there is none, so the response can't reveal which emails are
 * registered. Rate limits and other failures are thrown.
 */
export async function sendSignInCode(client: VyboraClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: emailSchema.parse(email),
    options: { shouldCreateUser: false },
  });
  if (!error) return;
  const e = error as { code?: string; message?: string };
  if (
    e.code === 'otp_disabled' ||
    e.code === 'user_not_found' ||
    /signups not allowed/i.test(e.message ?? '')
  ) {
    return;
  }
  throw error;
}

/**
 * Check a code emailed for sign-up confirmation (`signup`) or sign-in
 * (`signin`). On success the client holds a session. Throws the Supabase
 * error (e.g. `otp_expired`) when the code is wrong or has expired.
 */
export async function verifyEmailCode(
  client: VyboraClient,
  input: { email: string; code: string; purpose: 'signup' | 'signin' },
): Promise<void> {
  const email = emailSchema.parse(input.email);
  // Accept a pasted "123 456" / "123-456", but never truncate a longer string.
  const token = emailCodeSchema.parse(input.code.replace(/\D/g, ''));
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: input.purpose === 'signup' ? 'signup' : 'email',
  });
  if (error) throw error;
  if (!data.session) throw new Error('no_session');
}

/**
 * Permanently delete the caller's account via the trusted `delete-account`
 * edge function (needs the service role to remove auth user + storage).
 */
export async function deleteAccount(client: VyboraClient, confirmUsername: string) {
  const { error } = await client.functions.invoke('delete-account', {
    body: { confirm_username: confirmUsername },
  });
  if (error) throw error;
  await client.auth.signOut();
}

export async function getMyRoles(client: VyboraClient, userId: string): Promise<string[]> {
  const rows = unwrap(await client.from('user_roles').select('role').eq('user_id', userId));
  return rows.map((r) => r.role);
}
