import { EMAIL_CODE_RESEND_SECONDS } from '@vybora/core';

export type CodePurpose = 'signup' | 'signin';

const COOLDOWN_MS = EMAIL_CODE_RESEND_SECONDS * 1000;

/**
 * When a code was last emailed to an address, for as long as the app runs.
 * The resend wait follows the address, not the screen: going back with "Use a
 * different email" and sending to the same address again keeps waiting, so a
 * quick second send can't be used to probe which emails have accounts.
 * Sign-up and sign-in codes are separate emails (with separate limits on the
 * server), so each purpose keeps its own clock. Same rules as the web app.
 */
const sentAt = new Map<string, number>();

const keyFor = (purpose: CodePurpose, email: string) => `${purpose}:${email.trim().toLowerCase()}`;

/** Record a send (now, by default) and return its time. */
export function markCodeSent(purpose: CodePurpose, email: string, now = Date.now()): number {
  for (const [key, at] of sentAt) if (now - at >= COOLDOWN_MS) sentAt.delete(key);
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
  return at === undefined ? 0 : secondsUntil(at + COOLDOWN_MS, now);
}

/** Whole seconds from `now` until `deadline`, never below 0. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Forget every send (tests). */
export function resetCodeCooldowns(): void {
  sentAt.clear();
}
