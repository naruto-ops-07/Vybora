import { friendlyError, type ErrorLike } from './errors';

/** Digits in the one-time code emailed for sign-up and sign-in. */
export const EMAIL_CODE_LENGTH = 6;
/** How long the "send a new code" button stays disabled after a send. */
export const EMAIL_CODE_RESEND_SECONDS = 60;
/** Shown after asking for a sign-in code, whether or not the email has an account. */
export const SIGN_IN_CODE_SENT = 'If there’s an account for that email, we’ve sent a code.';

/** Keep only the digits of typed or pasted text, at most one code's worth. */
export function digitsFromCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

/** Plain-language copy for a failed code check or send. */
export function emailCodeError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : '';
  if (e.status === 429 || e.code === 'over_email_send_rate_limit') {
    return 'Too many tries. Wait a minute, then try again.';
  }
  if (
    e.code === 'otp_expired' ||
    e.code === 'invalid_otp' ||
    message.includes('expired or is invalid')
  ) {
    return 'That code didn’t work. Check it or send a new one.';
  }
  return friendlyError(error);
}
