/**
 * Per-device, per-user first-run record (`vybora.onboarding.<userId>` in
 * SecureStore), the mobile twin of the web store. SecureStore is async, so the
 * record reports `loaded` and Get started stays hidden until it is; an update
 * made before then waits for the stored copy so it never overwrites it.
 * HandleCard writes it (copied / shared) and Get started reads it.
 */
import {
  emptyOnboarding,
  onboardingKey,
  parseOnboarding,
  type OnboardingRecord,
} from '@vybora/core';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

interface Entry {
  record: OnboardingRecord;
  loaded: boolean;
}

const memory = new Map<string, Entry>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const EMPTY: Entry = { record: emptyOnboarding(), loaded: false };

function load(userId: string): Promise<void> {
  const existing = loading.get(userId);
  if (existing) return existing;
  const p = SecureStore.getItemAsync(onboardingKey(userId))
    .catch(() => null)
    .then((raw) => {
      const current = memory.get(userId);
      // An update that landed while loading wins over what was stored.
      memory.set(userId, {
        record: { ...parseOnboarding(raw), ...(current?.record ?? {}) },
        loaded: true,
      });
      notify();
    });
  loading.set(userId, p);
  return p;
}

function entry(userId: string): Entry {
  return memory.get(userId) ?? EMPTY;
}

/** Merge a patch (after the stored copy has loaded); a no-op patch neither writes nor notifies. */
export async function updateOnboarding(userId: string, patch: Partial<OnboardingRecord>) {
  await load(userId);
  const before = entry(userId).record;
  const next = { ...before, ...patch };
  if ((Object.keys(next) as (keyof OnboardingRecord)[]).every((k) => next[k] === before[k])) return;
  memory.set(userId, { record: next, loaded: true });
  notify();
  try {
    await SecureStore.setItemAsync(onboardingKey(userId), JSON.stringify(next));
  } catch {
    // Kept in memory for this session.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnboarding(userId: string | undefined) {
  useEffect(() => {
    if (userId) void load(userId);
  }, [userId]);
  const current = useSyncExternalStore(
    subscribe,
    () => (userId ? entry(userId) : EMPTY),
    () => EMPTY,
  );
  const update = useCallback(
    (patch: Partial<OnboardingRecord>) => {
      if (userId) void updateOnboarding(userId, patch);
    },
    [userId],
  );
  return [current.record, update, current.loaded] as const;
}

/** Users who reached 3 of 3 during this app run: they see "You're all set" until restart. */
export const allSetThisSession = new Set<string>();

/** Tests only: forget the in-memory copies. */
export function resetOnboardingMemory() {
  memory.clear();
  loading.clear();
  allSetThisSession.clear();
}
