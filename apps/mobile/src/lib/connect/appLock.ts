import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'vybora.connect.applock';
let unlockedAt = 0;
const GRACE_MS = 60_000;

export async function isAppLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === '1';
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
  return true;
}

export async function authenticate(promptMessage = 'Unlock your messages'): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
  if (r.success) unlockedAt = Date.now();
  return r.success;
}

/** True if Messages may be shown now (lock off, or unlocked within the grace window). */
export async function isUnlocked(): Promise<boolean> {
  if (!(await isAppLockEnabled())) return true;
  return Date.now() - unlockedAt < GRACE_MS;
}
