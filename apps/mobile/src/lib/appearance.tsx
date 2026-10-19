import type { Look, Mode } from '@vybora/config';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveMode,
  type Appearance,
  type ModePref,
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
import { useColorScheme } from 'react-native';
import { loadLookFonts } from './fonts';

/**
 * Appearance: the look (Velvet, Aurora, Bloom) and light / dark / match-system mode.
 * Per device (SecureStore, key `vybora.appearance`, JSON `{ look, mode }`), never synced.
 * Same API as web `useAppearance()`.
 */
export interface AppearanceState extends Appearance {
  /** The mode in effect: `mode`, or the system's when `mode` is `system`. */
  resolved: Mode;
  /** The stored appearance and its look's fonts are loaded (the splash waits for this). */
  ready: boolean;
  /** Loads the look's fonts first, then switches, so text never flashes another face. */
  setLook: (look: Look) => void;
  setMode: (mode: ModePref) => void;
}

interface Store {
  appearance: Appearance;
  ready: boolean;
  setLook: (look: Look) => void;
  setMode: (mode: ModePref) => void;
}

const Ctx = createContext<Store | null>(null);
const noop = () => undefined;

export function useAppearance(): AppearanceState {
  const store = useContext(Ctx);
  const systemDark = useColorScheme() === 'dark';
  const appearance = store?.appearance ?? DEFAULT_APPEARANCE;
  return {
    ...appearance,
    resolved: resolveMode(appearance.mode, systemDark),
    ready: store?.ready ?? true,
    setLook: store?.setLook ?? noop,
    setMode: store?.setMode ?? noop,
  };
}

const persist = (a: Appearance) =>
  void SecureStore.setItemAsync(APPEARANCE_KEY, JSON.stringify(a)).catch(() => undefined);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const latest = useRef(appearance);
  // The last look asked for: a slower font load for an earlier tap never wins.
  const wanted = useRef<Look | null>(null);

  const apply = useCallback((next: Appearance, save: boolean) => {
    latest.current = next;
    setAppearance(next);
    if (save) persist(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let stored = DEFAULT_APPEARANCE;
      try {
        stored = parseAppearance(await SecureStore.getItemAsync(APPEARANCE_KEY));
      } catch {
        // Unreadable store: the defaults.
      }
      await loadLookFonts(stored.look);
      if (!alive) return;
      // A choice made while loading (unlikely: the splash is up) wins over the stored one.
      if (wanted.current === null) apply(stored, false);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [apply]);

  const setLook = useCallback(
    (look: Look) => {
      wanted.current = look;
      void loadLookFonts(look).then(() => {
        if (wanted.current !== look) return;
        apply({ ...latest.current, look }, true);
      });
    },
    [apply],
  );

  const setMode = useCallback(
    (mode: ModePref) => apply({ ...latest.current, mode }, true),
    [apply],
  );

  const value = useMemo<Store>(
    () => ({ appearance, ready, setLook, setMode }),
    [appearance, ready, setLook, setMode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
