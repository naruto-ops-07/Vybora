import { APP_LOCK_AWAY_DEFAULT, awayLockDue, isAppLockAway, type AppLockAway } from '@vybora/core';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Mobile app lock: Face ID, fingerprint or the device passcode (expo-local-authentication).
 * It locks when the app opens and, once unlocked, again after the chosen time away
 * (the shared `awayLockDue` rule from @vybora/core). Per device, never synced.
 */
const KEY = 'vybora.connect.applock';
const AWAY_KEY = 'vybora.connect.applock.away';

let enabledCache: boolean | null = null;
let awayCache: AppLockAway = APP_LOCK_AWAY_DEFAULT;
let unlockedAt = 0;
let backgroundAt: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called when the lock state may have changed (unlocked, locked, turned on or off). */
export function subscribeAppLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export async function isAppLockEnabled(): Promise<boolean> {
  enabledCache = (await SecureStore.getItemAsync(KEY)) === '1';
  return enabledCache;
}

/** The last known on/off state, for synchronous checks (the app-switcher cover). */
export const appLockEnabledNow = () => enabledCache === true;

export async function getAppLockAway(): Promise<AppLockAway> {
  const raw = await SecureStore.getItemAsync(AWAY_KEY);
  awayCache = isAppLockAway(raw) ? raw : APP_LOCK_AWAY_DEFAULT;
  return awayCache;
}

export async function setAppLockAway(away: AppLockAway): Promise<void> {
  await SecureStore.setItemAsync(AWAY_KEY, away);
  awayCache = away;
}

export async function appLockSupport(): Promise<{ available: boolean; reason?: string }> {
  const hardware = await LocalAuthentication.hasHardwareAsync();
  if (!hardware)
    return { available: false, reason: 'This device has no biometric or passcode hardware.' };
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled)
    return { available: false, reason: 'Set up Face ID, fingerprint or a device passcode first.' };
  return { available: true };
}

export async function setAppLock(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const ok = await authenticate('Turn on app lock for Messages');
    if (!ok) return false;
    await SecureStore.setItemAsync(KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
  enabledCache = enabled;
  emit();
  return true;
}

export async function authenticate(promptMessage = 'Unlock your messages'): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
  if (r.success) {
    unlockedAt = Date.now();
    backgroundAt = null;
    emit();
  }
  return r.success;
}

/** The app went to the background (AppState `background`): start the away clock. */
export function noteBackground(now = Date.now()): void {
  if (backgroundAt === null) backgroundAt = now;
}

/** Applies a finished time away: locks if it reached the chosen setting. */
function settle(now: number): void {
  if (backgroundAt === null) return;
  const hidden = now - backgroundAt;
  backgroundAt = null;
  if (unlockedAt && awayLockDue(awayCache, hidden)) {
    unlockedAt = 0;
    emit();
  }
}

/** The app is active again (AppState `active`). */
export function noteActive(now = Date.now()): void {
  settle(now);
}

/** True if Messages may be shown now: lock off, or unlocked and not away too long. */
export async function isUnlocked(now = Date.now()): Promise<boolean> {
  if (!(await isAppLockEnabled())) return true;
  await getAppLockAway();
  settle(now);
  return unlockedAt > 0;
}

/** Tests only: forget the in-memory unlock. */
export function resetAppLockForTests(): void {
  enabledCache = null;
  awayCache = APP_LOCK_AWAY_DEFAULT;
  unlockedAt = 0;
  backgroundAt = null;
  listeners.clear();
}
