/**
 * App lock rules shared by the clients: hashing parameters, wrong-attempt backoff and
 * the away-time rule. Pure; storage, WebCrypto and WebAuthn live in each app.
 */

/** Digits in the app-lock passcode. */
export const APP_LOCK_PASSCODE_LENGTH = 6;

/** How the passcode is stretched before it is stored (never sent anywhere). */
export const APP_LOCK_PBKDF2 = {
  hash: 'SHA-256',
  iterations: 600_000,
  saltBytes: 16,
  bits: 256,
} as const;

/** Settings copy: what the lock does and doesn’t do. */
export const APP_LOCK_HONESTY =
  'App lock hides your chats on this device. It doesn’t encrypt them.';

/** Where a user’s lock lives in this device’s storage. */
export const appLockKey = (userId: string) => `vybora.applock.${userId}`;

const PASSCODE = new RegExp(`^\\d{${APP_LOCK_PASSCODE_LENGTH}}$`);
export const isValidPasscode = (code: string) => PASSCODE.test(code);

/** Keep only digits of typed or pasted text, at most one passcode’s worth. */
export const passcodeDigits = (text: string) =>
  text.replace(/\D/g, '').slice(0, APP_LOCK_PASSCODE_LENGTH);

/** Equal length and bytes, without stopping at the first difference. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---- Away time ----

export type AppLockAway = 'immediately' | '1m' | '5m' | '1h';
export const APP_LOCK_AWAY_DEFAULT: AppLockAway = '1m';
export const APP_LOCK_AWAY_MS: Record<AppLockAway, number> = {
  immediately: 0,
  '1m': 60_000,
  '5m': 300_000,
  '1h': 3_600_000,
};
export const APP_LOCK_AWAY_OPTIONS: { value: AppLockAway; label: string }[] = [
  { value: 'immediately', label: 'Immediately' },
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '1h', label: '1 hour' },
];
export const isAppLockAway = (v: unknown): v is AppLockAway =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(APP_LOCK_AWAY_MS, v);

/** The tab came back after being hidden for `hiddenMs`: lock now? */
export function awayLockDue(away: AppLockAway, hiddenMs: number): boolean {
  if (away === 'immediately') return hiddenMs > 0;
  return hiddenMs >= APP_LOCK_AWAY_MS[away];
}

/** No activity in a visible tab for `idleMs` (device idle). “Immediately” waits a minute. */
export function idleLockDue(away: AppLockAway, idleMs: number): boolean {
  return idleMs >= Math.max(APP_LOCK_AWAY_MS[away], 60_000);
}

// ---- Wrong attempts ----

export interface AppLockAttempts {
  failures: number;
  /** Epoch ms before which no passcode is checked (0 when there is no wait). */
  waitUntil: number;
}

export const APP_LOCK_FREE_TRIES = 5;
export const APP_LOCK_FIRST_WAIT_MS = 30_000;
export const APP_LOCK_SIGN_OUT_AFTER = 10;

export const initialAttempts = (): AppLockAttempts => ({ failures: 0, waitUntil: 0 });

/** The wait after `failures` wrong tries: none before 5, then 30 s doubling. */
export function waitAfterFailures(failures: number): number {
  if (failures < APP_LOCK_FREE_TRIES) return 0;
  return APP_LOCK_FIRST_WAIT_MS * 2 ** (failures - APP_LOCK_FREE_TRIES);
}

export function recordFailure(s: AppLockAttempts, now: number): AppLockAttempts {
  const failures = s.failures + 1;
  const wait = waitAfterFailures(failures);
  return { failures, waitUntil: wait ? now + wait : 0 };
}

export const waitRemainingMs = (s: AppLockAttempts, now: number) => Math.max(0, s.waitUntil - now);

export const shouldOfferSignOut = (s: AppLockAttempts) => s.failures >= APP_LOCK_SIGN_OUT_AFTER;

/** “30 seconds”, “2 minutes”: a wait, rounded up, in words. */
export function waitWords(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Said after a wrong passcode (announced to screen readers). */
export function wrongPasscodeMessage(s: AppLockAttempts, now: number): string {
  const wait = waitRemainingMs(s, now);
  return wait ? `Wrong passcode. Try again in ${waitWords(wait)}.` : 'Wrong passcode. Try again.';
}
