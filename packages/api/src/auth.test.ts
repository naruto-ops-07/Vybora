import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSignInCode, verifyEmailCode } from './auth';
import type { VyboraClient } from './client';

const auth = { signInWithOtp: vi.fn(), verifyOtp: vi.fn() };
const client = { auth } as unknown as VyboraClient;

describe('email code auth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it('asks for a sign-in code without creating users', async () => {
    await sendSignInCode(client, ' Maya@Example.com ');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'maya@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('stays silent when there is no account (no enumeration)', async () => {
    auth.signInWithOtp.mockResolvedValue({
      error: { code: 'otp_disabled', message: 'Signups not allowed for otp' },
    });
    await expect(sendSignInCode(client, 'nobody@example.com')).resolves.toBeUndefined();
  });

  it('passes rate limits through', async () => {
    const err = { status: 429, code: 'over_email_send_rate_limit', message: 'rate' };
    auth.signInWithOtp.mockResolvedValue({ error: err });
    await expect(sendSignInCode(client, 'a@b.co')).rejects.toBe(err);
  });

  it('verifies with the right Supabase type per purpose', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    await verifyEmailCode(client, { email: 'A@b.co', code: '123 456', purpose: 'signup' });
    expect(auth.verifyOtp).toHaveBeenLastCalledWith({
      email: 'a@b.co',
      token: '123456',
      type: 'signup',
    });
    await verifyEmailCode(client, { email: 'a@b.co', code: '123456', purpose: 'signin' });
    expect(auth.verifyOtp).toHaveBeenLastCalledWith({
      email: 'a@b.co',
      token: '123456',
      type: 'email',
    });
  });

  it('rejects a malformed code before calling Supabase, and surfaces verify errors', async () => {
    await expect(
      verifyEmailCode(client, { email: 'a@b.co', code: '12', purpose: 'signin' }),
    ).rejects.toThrow();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { code: 'otp_expired', message: 'x' },
    });
    await expect(
      verifyEmailCode(client, { email: 'a@b.co', code: '123456', purpose: 'signin' }),
    ).rejects.toMatchObject({ code: 'otp_expired' });
  });
});
