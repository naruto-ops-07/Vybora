import { describe, expect, it } from 'vitest';
import {
  APP_LOCK_AWAY_DEFAULT,
  APP_LOCK_PBKDF2,
  appLockKey,
  awayLockDue,
  bytesEqual,
  idleLockDue,
  initialAttempts,
  isValidPasscode,
  recordFailure,
  shouldOfferSignOut,
  waitAfterFailures,
  waitRemainingMs,
  wrongPasscodeMessage,
} from './appLock';

describe('app lock params', () => {
  it('uses PBKDF2-SHA-256 with 600 000 iterations and a 16-byte salt', () => {
    expect(APP_LOCK_PBKDF2).toEqual({
      hash: 'SHA-256',
      iterations: 600_000,
      saltBytes: 16,
      bits: 256,
    });
  });
  it('keys storage per user', () => {
    expect(appLockKey('u1')).toBe('vybora.applock.u1');
  });
  it('accepts exactly six digits', () => {
    expect(isValidPasscode('123456')).toBe(true);
    expect(isValidPasscode('12345')).toBe(false);
    expect(isValidPasscode('12345a')).toBe(false);
  });
  it('compares bytes in full', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});

describe('wrong-attempt backoff', () => {
  it('has no wait for the first four wrong tries', () => {
    for (let n = 0; n < 5; n++) expect(waitAfterFailures(n)).toBe(0);
  });
  it('waits 30 s after 5, doubling each time', () => {
    expect(waitAfterFailures(5)).toBe(30_000);
    expect(waitAfterFailures(6)).toBe(60_000);
    expect(waitAfterFailures(7)).toBe(120_000);
    expect(waitAfterFailures(10)).toBe(960_000);
  });
  it('records failures with a wait deadline', () => {
    let s = initialAttempts();
    for (let i = 0; i < 4; i++) s = recordFailure(s, 1000);
    expect(s).toEqual({ failures: 4, waitUntil: 0 });
    s = recordFailure(s, 1000);
    expect(s).toEqual({ failures: 5, waitUntil: 31_000 });
    expect(waitRemainingMs(s, 1000)).toBe(30_000);
    expect(waitRemainingMs(s, 31_000)).toBe(0);
    s = recordFailure(s, 31_000);
    expect(waitRemainingMs(s, 31_000)).toBe(60_000);
  });
  it('offers sign out after 10 wrong tries', () => {
    expect(shouldOfferSignOut({ failures: 9, waitUntil: 0 })).toBe(false);
    expect(shouldOfferSignOut({ failures: 10, waitUntil: 0 })).toBe(true);
  });
  it('explains the wait in plain words', () => {
    expect(wrongPasscodeMessage({ failures: 1, waitUntil: 0 }, 0)).toBe(
      'Wrong passcode. Try again.',
    );
    expect(wrongPasscodeMessage({ failures: 5, waitUntil: 30_000 }, 0)).toBe(
      'Wrong passcode. Try again in 30 seconds.',
    );
    expect(wrongPasscodeMessage({ failures: 7, waitUntil: 120_000 }, 0)).toBe(
      'Wrong passcode. Try again in 2 minutes.',
    );
  });
});

describe('away-time rule', () => {
  it('defaults to 1 minute', () => {
    expect(APP_LOCK_AWAY_DEFAULT).toBe('1m');
  });
  it('locks per setting after time hidden', () => {
    expect(awayLockDue('immediately', 1)).toBe(true);
    expect(awayLockDue('immediately', 0)).toBe(false);
    expect(awayLockDue('1m', 59_999)).toBe(false);
    expect(awayLockDue('1m', 60_000)).toBe(true);
    expect(awayLockDue('5m', 299_999)).toBe(false);
    expect(awayLockDue('5m', 300_000)).toBe(true);
    expect(awayLockDue('1h', 3_599_999)).toBe(false);
    expect(awayLockDue('1h', 3_600_000)).toBe(true);
  });
  it('locks an idle visible tab after the setting, never sooner than a minute', () => {
    expect(idleLockDue('immediately', 30_000)).toBe(false);
    expect(idleLockDue('immediately', 60_000)).toBe(true);
    expect(idleLockDue('5m', 120_000)).toBe(false);
    expect(idleLockDue('5m', 300_000)).toBe(true);
  });
});
