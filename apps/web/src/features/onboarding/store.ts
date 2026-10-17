/**
 * Per-device, per-user first-run record (`vybora.onboarding.<userId>` in
 * localStorage). Storage can be missing or throw (private mode, blocked site
 * data), so every access is guarded and the in-memory copy keeps the session
 * consistent. HandleCard writes it (copied / shared) and Get started reads it,
 * so changes are broadcast to subscribers.
 */
import {
  emptyOnboarding,
  onboardingKey,
  parseOnboarding,
  type OnboardingRecord,
} from '@vybora/core';
import { useCallback, useSyncExternalStore } from 'react';

const memory = new Map<string, OnboardingRecord>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readOnboarding(userId: string): OnboardingRecord {
  const cached = memory.get(userId);
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(onboardingKey(userId)) ?? null;
  } catch {
    raw = null;
  }
  const record = parseOnboarding(raw);
  memory.set(userId, record);
  return record;
}

/** Merge a patch; a no-op patch neither writes nor notifies. */
export function updateOnboarding(userId: string, patch: Partial<OnboardingRecord>) {
  const before = readOnboarding(userId);
  const next = { ...before, ...patch };
  if ((Object.keys(next) as (keyof OnboardingRecord)[]).every((k) => next[k] === before[k])) return;
  memory.set(userId, next);
  try {
    storage()?.setItem(onboardingKey(userId), JSON.stringify(next));
  } catch {
    // Kept in memory for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it: drop the cached copy and re-read.
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('vybora.onboarding.')) {
      memory.delete(e.key.slice('vybora.onboarding.'.length));
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useOnboarding(userId: string | undefined) {
  const record = useSyncExternalStore(
    subscribe,
    () => (userId ? readOnboarding(userId) : EMPTY),
    () => EMPTY,
  );
  const update = useCallback(
    (patch: Partial<OnboardingRecord>) => {
      if (userId) updateOnboarding(userId, patch);
    },
    [userId],
  );
  return [record, update] as const;
}

const EMPTY = emptyOnboarding();

/** Tests only: forget the in-memory copies. */
export function resetOnboardingMemory() {
  memory.clear();
}

/** Users who reached 3 of 3 during this page load: they see "You're all set" until reload. */
export const allSetThisSession = new Set<string>();
