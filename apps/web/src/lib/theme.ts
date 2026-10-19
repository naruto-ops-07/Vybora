import { LOOKS, looks, type Look, type Mode } from '@vybora/config';
import {
  APPEARANCE_KEY,
  parseAppearance,
  resolveMode,
  type Appearance,
  type ModePref,
} from '@vybora/core';
import { useSyncExternalStore } from 'react';

/**
 * Appearance (look + light/dark/system) for this device, kept in localStorage under
 * `vybora.appearance`. index.html applies it before first paint with an inline copy of
 * `initialAppearance` (theme.test.ts checks the two agree); this module takes over once
 * the app loads: it migrates the old key, follows the system mode, other tabs and loads
 * each look's fonts.
 */

/** The old web key (`light` / `dark` / `system`): read once as the mode, then removed. */
export const LEGACY_THEME_KEY = 'vybora-theme';

/** `<meta name="theme-color">` per look × mode: the look's background. */
export const THEME_COLORS = Object.fromEntries(
  LOOKS.map((l) => [l, { light: looks[l].modes.light.bg, dark: looks[l].modes.dark.bg }]),
) as Record<Look, Record<Mode, string>>;

/**
 * What the pre-paint script in index.html computes, as a pure function: the stored
 * appearance (falling back to the legacy key, then Velvet + system), resolved to a mode.
 * Never throws: unreadable storage or a missing matchMedia count as nothing stored and a
 * light system.
 */
export function initialAppearance(
  read: (key: string) => string | null,
  systemDark: () => boolean,
): { look: Look; mode: ModePref; theme: Mode; color: string } {
  const safe = (key: string) => {
    try {
      return read(key);
    } catch {
      return null;
    }
  };
  const { look, mode } = parseAppearance(safe(APPEARANCE_KEY), safe(LEGACY_THEME_KEY));
  let dark = false;
  if (mode === 'system') {
    try {
      dark = systemDark();
    } catch {
      dark = false;
    }
  }
  const theme = resolveMode(mode, dark);
  return { look, mode, theme, color: THEME_COLORS[look][theme] };
}

// --- Fonts -----------------------------------------------------------------------
// Velvet's faces (the default) and Plex Mono are imported up front in main.tsx; the
// other looks' faces load the first time they are shown (chosen, or previewed).
const FONT_LOADERS: Record<Look, () => Promise<unknown>> = {
  velvet: () => Promise.resolve(),
  aurora: () =>
    Promise.all([
      import('@fontsource-variable/sora/index.css'),
      import('@fontsource-variable/manrope/index.css'),
    ]),
  bloom: () => import('@fontsource-variable/plus-jakarta-sans/index.css'),
};
const fontsLoading = new Map<Look, Promise<unknown>>();

/** Loads a look's font CSS once. Failures are quiet: the stack falls back to system faces. */
export function loadLookFonts(look: Look): Promise<unknown> {
  let p = fontsLoading.get(look);
  if (!p) {
    p = FONT_LOADERS[look]().catch(() => fontsLoading.delete(look));
    fontsLoading.set(look, p);
  }
  return p;
}

// --- Store -----------------------------------------------------------------------
export interface AppearanceState extends Appearance {
  resolved: Mode;
}

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

const DARK_QUERY = '(prefers-color-scheme: dark)';
const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia(DARK_QUERY).matches;

let state: AppearanceState | null = null;
const listeners = new Set<() => void>();

function compute(a: Appearance): AppearanceState {
  return { ...a, resolved: resolveMode(a.mode, systemDark()) };
}

function apply(s: AppearanceState) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.look = s.look;
  html.dataset.theme = s.resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[s.look][s.resolved]);
  void loadLookFonts(s.look);
}

function commit(next: AppearanceState) {
  const changed =
    !state ||
    state.look !== next.look ||
    state.mode !== next.mode ||
    state.resolved !== next.resolved;
  const s = changed || !state ? next : state;
  state = s;
  apply(s);
  if (changed) listeners.forEach((l) => l());
}

/** Reads storage (migrating the legacy key) and applies the result. */
export function reloadAppearance(): AppearanceState {
  const legacy = storage.get(LEGACY_THEME_KEY);
  const appearance = parseAppearance(storage.get(APPEARANCE_KEY), legacy);
  if (legacy !== null) {
    storage.set(APPEARANCE_KEY, JSON.stringify(appearance));
    storage.remove(LEGACY_THEME_KEY);
  }
  commit(compute(appearance));
  return state!;
}

function current(): AppearanceState {
  return state ?? reloadAppearance();
}

function save(patch: Partial<Appearance>) {
  const { look, mode } = { ...current(), ...patch };
  storage.set(APPEARANCE_KEY, JSON.stringify({ look, mode }));
  commit(compute({ look, mode }));
}

let watching = false;
/**
 * Applies the saved appearance and keeps it current: the system light/dark setting (in
 * Match system) and changes made in another tab. Called once from main.tsx; hooks call
 * it too, so isolated renders behave the same.
 */
export function startAppearance(): AppearanceState {
  const s = current();
  if (watching || typeof window === 'undefined') return s;
  watching = true;
  if (typeof matchMedia !== 'undefined') {
    matchMedia(DARK_QUERY).addEventListener('change', () => commit(compute(current())));
  }
  window.addEventListener('storage', (e) => {
    if (e.key === APPEARANCE_KEY || e.key === null) reloadAppearance();
  });
  return s;
}

function subscribe(listener: () => void) {
  startAppearance();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const setLook = (look: Look) => save({ look });
const setMode = (mode: ModePref) => save({ mode });

/** The device's look and mode. Every caller shares one state. */
export function useAppearance(): AppearanceState & {
  setLook(look: Look): void;
  setMode(mode: ModePref): void;
} {
  const s = useSyncExternalStore(subscribe, current, current);
  return { ...s, setLook, setMode };
}
