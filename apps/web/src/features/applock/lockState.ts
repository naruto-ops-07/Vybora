/**
 * Whether this tab is locked right now, readable outside React (tones, read receipts).
 * Set only by AppLockProvider.
 */
import { useSyncExternalStore } from 'react';

let locked = false;
const listeners = new Set<() => void>();

export const isAppLocked = () => locked;

export function setAppLocked(next: boolean) {
  if (next === locked) return;
  locked = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True while the lock screen covers the app. Locked counts as “not looking”. */
export const useAppLocked = () => useSyncExternalStore(subscribe, isAppLocked, () => false);
