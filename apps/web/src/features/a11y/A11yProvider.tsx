import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  parseA11yPrefs,
  resolveReduceMotion,
  type A11yPrefs,
} from '@vybora/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface A11yState {
  prefs: A11yPrefs;
  setPrefs: (patch: Partial<A11yPrefs>) => void;
  /** Setting combined with the system "reduce motion" preference. */
  reduceMotion: boolean;
}

const FALLBACK: A11yState = {
  prefs: DEFAULT_A11Y_PREFS,
  setPrefs: () => undefined,
  reduceMotion: false,
};
const Ctx = createContext<A11yState | null>(null);

/** Defaults outside the provider so isolated component tests keep working. */
export const useA11y = () => useContext(Ctx) ?? FALLBACK;

function read(): A11yPrefs {
  try {
    return parseA11yPrefs(localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

const systemReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Per-device accessibility settings, applied as attributes on <html>. */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<A11yPrefs>(read);
  const [system, setSystem] = useState(systemReduced);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const reduceMotion = resolveReduceMotion(prefs.reduceMotion, system);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
    html.dataset.textSize = prefs.textSize;
    html.dataset.reduceMotion = String(reduceMotion);
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: settings last for this visit */
    }
  }, [prefs, reduceMotion]);

  const setPrefs = useCallback(
    (patch: Partial<A11yPrefs>) => setState((prev) => ({ ...prev, ...patch })),
    [],
  );
  const value = useMemo(() => ({ prefs, setPrefs, reduceMotion }), [prefs, setPrefs, reduceMotion]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
