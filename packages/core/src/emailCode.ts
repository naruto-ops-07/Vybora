import { friendlyError, type ErrorLike } from './errors';

/** Digits in the one-time code emailed for sign-up and sign-in. */
export const EMAIL_CODE_LENGTH = 6;
/** How long the "send a new code" button stays disabled after a send. */
export const EMAIL_CODE_RESEND_SECONDS = 60;
/** Shown after asking for a sign-in code, whether or not the email has an account. */
export const SIGN_IN_CODE_SENT = 'If there’s an account for that email, we’ve sent a code.';
/** Shown after Verify with some boxes still empty. */
export const EMAIL_CODE_INCOMPLETE = `Enter all ${EMAIL_CODE_LENGTH} digits.`;

/** What the code was emailed for: confirming a new account, or signing in. */
export type CodePurpose = 'signup' | 'signin';

/**
 * Shown after "Resend code" succeeds. A sign-in resend stays as neutral as the
 * first send: it never says whether the address has an account.
 */
export function codeResentMessage(purpose: CodePurpose): string {
  return purpose === 'signin'
    ? 'If there’s an account for that email, we’ve sent a new code.'
    : 'We sent a new code.';
}

/** Keep only the digits of typed or pasted text, at most one code's worth. */
export function digitsFromCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

const TOO_MANY_TRIES = 'Too many tries. Wait a minute, then try again.';
const WRONG_CODE = 'That code didn’t work. Check it or send a new one.';

/** Plain-language copy for a failed code check or send. */
export function emailCodeError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : '';
  // One Supabase error, one message: the email send limit reads as friendlyError puts it
  // (by code, or by message from older servers).
  if (e.code === 'over_email_send_rate_limit' || message.includes('email rate limit exceeded')) {
    return friendlyError(error);
  }
  // Any other 429 is the verify limit (too many codes tried) or the per-IP request limit.
  if (e.status === 429) return TOO_MANY_TRIES;
  if (
    e.code === 'otp_expired' ||
    e.code === 'invalid_otp' ||
    message.includes('expired or is invalid')
  ) {
    return WRONG_CODE;
  }
  return friendlyError(error);
}

/** 59 → "0:59", for the resend countdown. */
export function countdownClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Whole seconds from `now` until `deadline`, never below 0. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

const RESEND_MS = EMAIL_CODE_RESEND_SECONDS * 1000;

/** Whole seconds until a code sent at `sentAt` may be followed by another (0: now). */
export function resendWaitLeft(sentAt: number, now: number): number {
  return secondsUntil(sentAt + RESEND_MS, now);
}

/**
 * When a code was last emailed to an address, for as long as the page or app
 * runs. The resend wait follows the address, not the screen: going back with
 * "Use a different email" and sending to the same address again keeps
 * waiting, so a quick second send can't be used to probe which emails have
 * accounts. Sign-up and sign-in codes are separate emails (with separate
 * limits on the server), so each purpose keeps its own clock: asking for a
 * sign-in code never holds up creating the account.
 */
const sentAt = new Map<string, number>();

const keyFor = (purpose: CodePurpose, email: string) => `${purpose}:${email.trim().toLowerCase()}`;

/** Record a send (now, by default) and return its time. */
export function markCodeSent(purpose: CodePurpose, email: string, now = Date.now()): number {
  for (const [key, at] of sentAt) if (now - at >= RESEND_MS) sentAt.delete(key);
  sentAt.set(keyFor(purpose, email), now);
  return now;
}

/** When a code was last sent to `email` for `purpose`, if one was sent this session. */
export function lastCodeSent(purpose: CodePurpose, email: string): number | undefined {
  return sentAt.get(keyFor(purpose, email));
}

/** Whole seconds until another code may be sent to `email` (0: send now). */
export function codeCooldownLeft(purpose: CodePurpose, email: string, now = Date.now()): number {
  const at = lastCodeSent(purpose, email);
  return at === undefined ? 0 : resendWaitLeft(at, now);
}

/** Forget every send (tests). */
export function resetCodeCooldowns(): void {
  sentAt.clear();
}
