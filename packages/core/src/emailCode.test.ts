import { beforeEach, describe, expect, it } from 'vitest';
import {
  codeCooldownLeft,
  codeResentMessage,
  countdownClock,
  digitsFromCode,
  EMAIL_CODE_INCOMPLETE,
  EMAIL_CODE_RESEND_SECONDS,
  emailCodeError,
  lastCodeSent,
  markCodeSent,
  resendWaitLeft,
  resetCodeCooldowns,
  secondsUntil,
  SIGN_IN_CODE_SENT,
} from './emailCode';

const EMAIL_LIMIT = 'Too many emails were sent just now. Wait a few minutes, then try again.';
const TOO_MANY_TRIES = 'Too many tries. Wait a minute, then try again.';

describe('email code helpers', () => {
  it('keeps only the digits of a pasted code, at most six', () => {
    expect(digitsFromCode('123 456')).toBe('123456');
    expect(digitsFromCode('Your code: 123-456.')).toBe('123456');
    expect(digitsFromCode('12345678')).toBe('123456');
    expect(digitsFromCode('abc')).toBe('');
  });

  it('maps code errors to plain copy', () => {
    expect(
      emailCodeError({ code: 'otp_expired', message: 'Token has expired or is invalid' }),
    ).toBe('That code didn’t work. Check it or send a new one.');
    expect(emailCodeError({ message: 'Token has expired or is invalid' })).toBe(
      'That code didn’t work. Check it or send a new one.',
    );
    expect(emailCodeError(new TypeError('Failed to fetch'))).toMatch(/offline|connection/i);
  });

  it('gives the email send limit the same copy as friendlyError, and other 429s "too many tries"', () => {
    expect(emailCodeError({ status: 429, code: 'over_email_send_rate_limit', message: 'x' })).toBe(
      EMAIL_LIMIT,
    );
    // Older servers send only the message.
    expect(emailCodeError({ status: 429, message: 'email rate limit exceeded' })).toBe(EMAIL_LIMIT);
    // The verify limit (too many codes tried) and the per-IP request limit.
    expect(emailCodeError({ status: 429, code: 'over_request_rate_limit', message: 'x' })).toBe(
      TOO_MANY_TRIES,
    );
    expect(emailCodeError({ status: 429, message: 'Request rate limit reached' })).toBe(
      TOO_MANY_TRIES,
    );
  });

  it('has one copy for the shared screen text', () => {
    expect(SIGN_IN_CODE_SENT).toBe('If there’s an account for that email, we’ve sent a code.');
    expect(EMAIL_CODE_INCOMPLETE).toBe('Enter all 6 digits.');
    expect(codeResentMessage('signin')).toBe(
      'If there’s an account for that email, we’ve sent a new code.',
    );
    expect(codeResentMessage('signup')).toBe('We sent a new code.');
  });

  it('formats the resend countdown as m:ss', () => {
    expect(countdownClock(60)).toBe('1:00');
    expect(countdownClock(59)).toBe('0:59');
    expect(countdownClock(5)).toBe('0:05');
    expect(countdownClock(0)).toBe('0:00');
    expect(countdownClock(-3)).toBe('0:00');
  });

  it('counts whole seconds up to a deadline, never below zero', () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_001)).toBe(1);
    expect(secondsUntil(10_000, 10_000)).toBe(0);
    expect(secondsUntil(10_000, 20_000)).toBe(0);
    expect(resendWaitLeft(0, 0)).toBe(EMAIL_CODE_RESEND_SECONDS);
    expect(resendWaitLeft(0, 1_000)).toBe(59);
    expect(resendWaitLeft(0, 60_000)).toBe(0);
  });
});

describe('code cooldowns', () => {
  beforeEach(() => resetCodeCooldowns());

  it('follows the address, ignoring case and spaces', () => {
    expect(codeCooldownLeft('signin', 'maya@example.com', 0)).toBe(0);
    expect(markCodeSent('signin', ' Maya@Example.com ', 1_000)).toBe(1_000);
    expect(lastCodeSent('signin', 'maya@example.com')).toBe(1_000);
    expect(codeCooldownLeft('signin', 'maya@example.com', 21_000)).toBe(40);
    expect(codeCooldownLeft('signin', 'maya@example.com', 61_000)).toBe(0);
    // Another address has its own clock.
    expect(codeCooldownLeft('signin', 'other@example.com', 21_000)).toBe(0);
  });

  it('keeps a separate clock for sign-up and sign-in codes', () => {
    markCodeSent('signin', 'maya@example.com', 0);
    expect(codeCooldownLeft('signup', 'maya@example.com', 1_000)).toBe(0);
    expect(lastCodeSent('signup', 'maya@example.com')).toBeUndefined();
  });

  it('drops finished waits on the next send, and forgets everything on reset', () => {
    markCodeSent('signin', 'old@example.com', 0);
    markCodeSent('signin', 'new@example.com', 60_000);
    expect(lastCodeSent('signin', 'old@example.com')).toBeUndefined();
    expect(lastCodeSent('signin', 'new@example.com')).toBe(60_000);
    resetCodeCooldowns();
    expect(lastCodeSent('signin', 'new@example.com')).toBeUndefined();
  });
});
