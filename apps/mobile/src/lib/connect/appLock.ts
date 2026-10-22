import { APP_LOCK_AWAY_DEFAULT, awayLockDue, isAppLockAway, type AppLockAway } from '@vybora/core';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Mobile app lock: Face ID, fingerprint or the device passcode (expo-local-authentication).
 * Per signed-in user and per device, never synced. It locks when the app opens and,
 * once unlocked, again after the chosen time away (the shared `awayLockDue` rule from
 * @vybora/core). Signing out clears the user's lock, as on web.
 */
// SecureStore keys allow only [A-Za-z0-9._-]; Supabase user ids are UUIDs.
const enabledKey = (userId: string) => `vybora.connect.applock.${userId}`;
const awayKey = (userId: string) => `vybora.connect.applock.away.${userId}`;
/** Before per-user keys: one device-wide on/off flag. Adopted by the first user to load. */
const LEGACY_KEY = 'vybora.connect.applock';

let user: string | null = null;
let enabledCache: boolean | null = null;
let awayCache: AppLockAway = APP_LOCK_AWAY_DEFAULT;
let unlockedAt = 0;
let backgroundAt: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called when the lock state may have changed (unlocked, locked, loaded, turned on or off). */
export function subscribeAppLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The signed-in user changed: forget any unlock and load that user's settings. */
export async function setAppLockUser(userId: string | null): Promise<void> {
  if (userId === user) return;
  user = userId;
  unlockedAt = 0;
  backgroundAt = null;
  enabledCache = userId ? null : false;
  awayCache = APP_LOCK_AWAY_DEFAULT;
  emit();
  if (!userId) return;
  await Promise.all([isAppLockEnabled(), getAppLockAway()]);
  emit();
}

/** Sign-out: remove this user's lock and forget the unlock. */
export async function clearAppLock(userId: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(enabledKey(userId)),
    SecureStore.deleteItemAsync(awayKey(userId)),
  ]);
  if (user === userId) {
    enabledCache = false;
    unlockedAt = 0;
    backgroundAt = null;
    emit();
  }
}

export async function isAppLockEnabled(): Promise<boolean> {
  const u = user;
  if (!u) return (enabledCache = false);
  let on = (await SecureStore.getItemAsync(enabledKey(u))) === '1';
  if (!on && (await SecureStore.getItemAsync(LEGACY_KEY)) === '1') {
    await SecureStore.setItemAsync(enabledKey(u), '1');
    await SecureStore.deleteItemAsync(LEGACY_KEY);
    on = true;
  }
  if (u === user) enabledCache = on;
  return on;
}

/** Last known on/off state; null until loaded for the current user. */
export const appLockEnabledNow = (): boolean | null => enabledCache;

/**
 * Synchronous snapshot for gates: true (show), false (locked) or null (not loaded yet,
 * show nothing). Reads only memory, so a gate can decide in the same render pass.
 */
export function isUnlockedNow(): boolean | null {
  if (enabledCache === null) return null;
  return !enabledCache || unlockedAt > 0;
}

export async function getAppLockAway(): Promise<AppLockAway> {
  if (!user) return APP_LOCK_AWAY_DEFAULT;
  const raw = await SecureStore.getItemAsync(awayKey(user));
  awayCache = isAppLockAway(raw) ? raw : APP_LOCK_AWAY_DEFAULT;
  return awayCache;
}

export async function setAppLockAway(away: AppLockAway): Promise<void> {
  if (!user) return;
  await SecureStore.setItemAsync(awayKey(user), away);
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
  if (!user) return false;
  if (enabled) {
    const ok = await authenticate('Turn on app lock for Messages');
    if (!ok) return false;
    await SecureStore.setItemAsync(enabledKey(user), '1');
  } else {
    await SecureStore.deleteItemAsync(enabledKey(user));
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

/** The app is active again (AppState `active`): lock now if the time away reached the setting. */
export function noteActive(now = Date.now()): void {
  if (backgroundAt === null) return;
  const hidden = now - backgroundAt;
  backgroundAt = null;
  if (unlockedAt && awayLockDue(awayCache, hidden)) {
    unlockedAt = 0;
    emit();
  }
}

/** Async form of `isUnlockedNow` that loads the settings first. */
export async function isUnlocked(now = Date.now()): Promise<boolean> {
  if (!(await isAppLockEnabled())) return true;
  await getAppLockAway();
  noteActive(now);
  return unlockedAt > 0;
}

/** Tests only: forget everything in memory. */
export function resetAppLockForTests(): void {
  user = null;
  enabledCache = null;
  awayCache = APP_LOCK_AWAY_DEFAULT;
  unlockedAt = 0;
  backgroundAt = null;
  listeners.clear();
}
