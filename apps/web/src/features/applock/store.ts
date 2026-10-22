/**
 * This device’s app lock, in localStorage under `vybora.applock.<userId>`. The passcode is
 * stored only as a PBKDF2-SHA-256 hash with a random salt; a WebAuthn credential only as
 * its id and public key. Nothing here is ever sent to the server.
 */
import {
  APP_LOCK_AWAY_DEFAULT,
  APP_LOCK_PBKDF2,
  appLockKey,
  bytesEqual,
  initialAttempts,
  isAppLockAway,
  type AppLockAttempts,
  type AppLockAway,
} from '@vybora/core';

export interface StoredBiometric {
  /** base64url credential id */
  id: string;
  /** base64url SubjectPublicKeyInfo */
  publicKey: string;
  /** COSE algorithm: -7 (ES256) or -257 (RS256) */
  alg: number;
}

export interface AppLockRecord {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
  away: AppLockAway;
  biometric: StoredBiometric | null;
  attempts: AppLockAttempts;
}

export const toB64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromB64 = (text: string): Uint8Array<ArrayBuffer> => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

export async function hashPasscode(
  passcode: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = APP_LOCK_PBKDF2.iterations,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: APP_LOCK_PBKDF2.hash, salt, iterations },
    key,
    APP_LOCK_PBKDF2.bits,
  );
  return new Uint8Array(bits);
}

/** A fresh record for a new passcode (random salt). */
export async function createRecord(
  passcode: string,
  away: AppLockAway = APP_LOCK_AWAY_DEFAULT,
): Promise<AppLockRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(APP_LOCK_PBKDF2.saltBytes));
  const hash = await hashPasscode(passcode, salt);
  return {
    v: 1,
    salt: toB64(salt),
    hash: toB64(hash),
    iterations: APP_LOCK_PBKDF2.iterations,
    away,
    biometric: null,
    attempts: initialAttempts(),
  };
}

export async function verifyPasscode(record: AppLockRecord, passcode: string): Promise<boolean> {
  const hash = await hashPasscode(passcode, fromB64(record.salt), record.iterations);
  return bytesEqual(hash, fromB64(record.hash));
}

function parse(raw: string | null): AppLockRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<AppLockRecord>;
    if (r.v !== 1 || typeof r.salt !== 'string' || typeof r.hash !== 'string') return null;
    return {
      v: 1,
      salt: r.salt,
      hash: r.hash,
      iterations: typeof r.iterations === 'number' ? r.iterations : APP_LOCK_PBKDF2.iterations,
      away: isAppLockAway(r.away) ? r.away : APP_LOCK_AWAY_DEFAULT,
      biometric: r.biometric && typeof r.biometric.id === 'string' ? r.biometric : null,
      attempts:
        r.attempts && typeof r.attempts.failures === 'number' ? r.attempts : initialAttempts(),
    };
  } catch {
    return null;
  }
}

export function loadLock(userId: string): AppLockRecord | null {
  try {
    return parse(localStorage.getItem(appLockKey(userId)));
  } catch {
    return null;
  }
}

export function saveLock(userId: string, record: AppLockRecord) {
  try {
    localStorage.setItem(appLockKey(userId), JSON.stringify(record));
  } catch {
    // Storage full or blocked: the lock simply isn’t kept on this device.
  }
}

/** Turning the lock off, or signing out of this device. */
export function clearLock(userId: string) {
  try {
    localStorage.removeItem(appLockKey(userId));
  } catch {
    // ignore
  }
}
