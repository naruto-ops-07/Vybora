import { describe, expect, it } from 'vitest';
import { digitsFromCode, emailCodeError } from './emailCode';

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
    expect(emailCodeError({ status: 429, code: 'over_email_send_rate_limit', message: 'x' })).toBe(
      'Too many tries. Wait a minute, then try again.',
    );
    expect(emailCodeError(new TypeError('Failed to fetch'))).toMatch(/offline|connection/i);
  });
});
