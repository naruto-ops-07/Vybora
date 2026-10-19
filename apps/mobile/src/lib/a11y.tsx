import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  parseA11yPrefs,
  resolveReduceMotion,
  TEXT_SIZE_PX,
  type A11yPrefs,
} from '@vybora/core';
import * as SecureStore from 'expo-secure-store';
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
import { AccessibilityInfo } from 'react-native';

export interface A11yState {
  prefs: A11yPrefs;
  setPrefs: (patch: Partial<A11yPrefs>) => void;
  reduceMotion: boolean;
  /** Message/row/composer text multiplier (1 = 15 px base). */
  textScale: number;
  /** Stored settings are loaded (the splash screen waits, so contrast never flashes). */
  ready: boolean;
}

const FALLBACK: A11yState = {
  prefs: DEFAULT_A11Y_PREFS,
  setPrefs: () => undefined,
  reduceMotion: false,
  textScale: 1,
  ready: true,
};
const Ctx = createContext<A11yState | null>(null);
export const useA11y = () => useContext(Ctx) ?? FALLBACK;

/** Per-device accessibility settings (SecureStore; never synced). */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<A11yPrefs>(DEFAULT_A11Y_PREFS);
  const [systemReduced, setSystemReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(A11Y_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        loaded.current = true;
        setState(parseA11yPrefs(raw));
        setReady(true);
      })
      .catch(() => {
        loaded.current = true;
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setSystemReduced)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    void SecureStore.setItemAsync(A11Y_STORAGE_KEY, JSON.stringify(prefs)).catch(() => undefined);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<A11yPrefs>) => {
    loaded.current = true;
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<A11yState>(
    () => ({
      prefs,
      setPrefs,
      reduceMotion: resolveReduceMotion(prefs.reduceMotion, systemReduced),
      textScale: TEXT_SIZE_PX[prefs.textSize] / TEXT_SIZE_PX.md,
      ready,
    }),
    [prefs, setPrefs, systemReduced, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
