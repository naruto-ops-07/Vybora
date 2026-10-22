import {
  appLockKey,
  awayLockDue,
  idleLockDue,
  initialAttempts,
  isValidPasscode,
  recordFailure,
  shouldOfferSignOut,
  waitRemainingMs,
  wrongPasscodeMessage,
  type AppLockAttempts,
  type AppLockAway,
} from '@vybora/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  clearLock,
  createRecord,
  loadLock,
  saveLock,
  verifyPasscode,
  type AppLockRecord,
} from './store';
import { setAppLocked } from './lockState';
import { biometricAvailable, registerBiometric, unlockWithBiometric } from './webauthn';

export type UnlockResult = { ok: true } | { ok: false; message: string };

export interface AppLockState {
  enabled: boolean;
  locked: boolean;
  away: AppLockAway | null;
  hasBiometric: boolean;
  /** A platform authenticator is available in this browser. */
  canUseBiometric: boolean;
  attempts: AppLockAttempts;
  offerSignOut: boolean;
  /** ms left before another passcode is checked */
  waitMs: number;
  unlock: (passcode: string) => Promise<UnlockResult>;
  unlockBiometric: () => Promise<UnlockResult>;
  turnOn: (passcode: string) => Promise<void>;
  turnOff: (passcode: string) => Promise<boolean>;
  setAway: (away: AppLockAway) => void;
  addBiometric: () => Promise<void>;
  removeBiometric: () => void;
  /** Forgotten passcode: clears the lock and signs this device out. */
  signOutDevice: () => Promise<void>;
  lockNow: () => void;
}

const Ctx = createContext<AppLockState | null>(null);

const IDLE_CHECK_MS = 15_000;
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const UNREAD_PREFIX = /^\(\d+\+?\)\s*/;

/** While locked, the tab title never shows an unread count. */
function useNeutralTitle(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const strip = () => {
      const t = document.title;
      if (UNREAD_PREFIX.test(t)) document.title = t.replace(UNREAD_PREFIX, '');
    };
    strip();
    const head = document.head;
    const obs = new MutationObserver(strip);
    obs.observe(head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [locked]);
}

export function AppLockProvider({
  userId,
  userName,
  signOut,
  now = Date.now,
  children,
}: {
  userId: string;
  userName: string;
  signOut: () => Promise<void>;
  now?: () => number;
  children: ReactNode;
}) {
  const [record, setRecord] = useState<AppLockRecord | null>(() => loadLock(userId));
  // Locks when the app opens.
  const [locked, setLocked] = useState(() => !!record);
  const [canUseBiometric, setCanUseBiometric] = useState(false);
  const [clock, setClock] = useState(now);
  const recordRef = useRef(record);
  recordRef.current = record;
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    void biometricAvailable().then(setCanUseBiometric);
  }, []);

  const write = useCallback(
    (next: AppLockRecord | null) => {
      if (next) saveLock(userId, next);
      else clearLock(userId);
      recordRef.current = next;
      setRecord(next);
    },
    [userId],
  );

  // Storage is the source of truth: other tabs share it. Every action re-reads it, so
  // wrong tries in one tab count in all of them and nothing is overwritten stale.
  const fresh = useCallback(() => {
    const r = loadLock(userId);
    recordRef.current = r;
    return r;
  }, [userId]);

  // Keep tabs in sync: turned on, changed or off elsewhere (off elsewhere unlocks here).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== appLockKey(userId)) return;
      const next = loadLock(userId);
      recordRef.current = next;
      setRecord(next);
      if (!next) setLocked(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  // Publish the lock for tones and read receipts.
  const isLocked = locked && !!record;
  useEffect(() => {
    setAppLocked(isLocked);
  }, [isLocked]);
  useEffect(() => () => setAppLocked(false), []);

  // Away time: hidden tab (visibilitychange) or no activity (idle device).
  const lastActive = useRef(now());
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const touch = () => {
      lastActive.current = nowRef.current();
    };
    const onVisibility = () => {
      const r = fresh();
      const t = nowRef.current();
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = t;
        // “Immediately” covers the chats before the tab is even shown in a switcher.
        if (r?.away === 'immediately') setLocked(true);
        return;
      }
      const since = hiddenAt.current;
      hiddenAt.current = null;
      lastActive.current = t;
      if (r && since !== null && awayLockDue(r.away, t - since)) setLocked(true);
    };
    const idle = window.setInterval(() => {
      const r = fresh();
      if (r && idleLockDue(r.away, nowRef.current() - lastActive.current)) setLocked(true);
    }, IDLE_CHECK_MS);
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(idle);
      for (const e of ACTIVITY) window.removeEventListener(e, touch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fresh]);

  useNeutralTitle(locked && !!record);

  // Tick while a wait runs, so the countdown and the field update.
  const waitUntil = record?.attempts.waitUntil ?? 0;
  useEffect(() => {
    if (!locked || waitUntil <= now()) return;
    const id = window.setInterval(() => {
      const t = nowRef.current();
      setClock(t);
      if (t >= waitUntil) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [locked, waitUntil, now]);

  const unlocked = useCallback(() => {
    const r = fresh();
    if (r && r.attempts.failures) write({ ...r, attempts: initialAttempts() });
    lastActive.current = nowRef.current();
    setLocked(false);
  }, [write, fresh]);

  const value = useMemo<AppLockState>(() => {
    const attempts = record?.attempts ?? initialAttempts();
    const t = Math.max(clock, now());
    return {
      enabled: !!record,
      locked: !!record && locked,
      away: record?.away ?? null,
      hasBiometric: !!record?.biometric,
      canUseBiometric,
      attempts,
      offerSignOut: shouldOfferSignOut(attempts),
      waitMs: waitRemainingMs(attempts, t),
      unlock: async (passcode) => {
        const r = fresh();
        if (!r) {
          setLocked(false);
          return { ok: true };
        }
        const at = nowRef.current();
        if (waitRemainingMs(r.attempts, at) > 0)
          return { ok: false, message: wrongPasscodeMessage(r.attempts, at) };
        if (isValidPasscode(passcode) && (await verifyPasscode(r, passcode))) {
          unlocked();
          return { ok: true };
        }
        // Re-read after the slow hash: another tab may have counted a try meanwhile.
        const latest = fresh() ?? r;
        const next = { ...latest, attempts: recordFailure(latest.attempts, nowRef.current()) };
        write(next);
        setClock(nowRef.current());
        return { ok: false, message: wrongPasscodeMessage(next.attempts, nowRef.current()) };
      },
      unlockBiometric: async () => {
        const r = fresh();
        if (!r?.biometric) return { ok: false, message: 'Biometric unlock isn’t set up.' };
        try {
          if (await unlockWithBiometric(r.biometric)) {
            unlocked();
            return { ok: true };
          }
        } catch {
          // Cancelled or timed out: fall through to the passcode.
        }
        return { ok: false, message: 'Couldn’t confirm it’s you. Use your passcode.' };
      },
      turnOn: async (passcode) => {
        const r = await createRecord(passcode);
        write(r);
        setLocked(false);
      },
      turnOff: async (passcode) => {
        const r = fresh();
        if (!r) return true;
        if (!(await verifyPasscode(r, passcode))) return false;
        write(null);
        setLocked(false);
        return true;
      },
      setAway: (away) => {
        const r = fresh();
        if (r) write({ ...r, away });
      },
      addBiometric: async () => {
        const r = fresh();
        if (!r) return;
        const biometric = await registerBiometric({ id: userId, name: userName });
        write({ ...(fresh() ?? r), biometric });
      },
      removeBiometric: () => {
        const r = fresh();
        if (r) write({ ...r, biometric: null });
      },
      signOutDevice: async () => {
        write(null);
        setLocked(false);
        await signOut();
      },
      lockNow: () => {
        if (fresh()) setLocked(true);
      },
    };
  }, [
    record,
    locked,
    canUseBiometric,
    clock,
    now,
    unlocked,
    write,
    fresh,
    signOut,
    userId,
    userName,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}

/** For surfaces that may render outside the provider (the dev gallery). */
export function useAppLockOptional() {
  return useContext(Ctx);
}
