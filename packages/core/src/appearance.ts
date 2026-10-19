import type { Look, Mode } from '@vybora/config';

/**
 * Appearance: the look (Velvet, Aurora, Bloom) and light/dark/system mode, kept per
 * device (web localStorage, mobile SecureStore), never sent to the server.
 */

/** Valid for localStorage and expo-secure-store (which rejects ':'). */
export const APPEARANCE_KEY = 'vybora.appearance';

export type ModePref = 'system' | 'light' | 'dark';

export interface Appearance {
  look: Look;
  mode: ModePref;
}

// Runtime copy of `LOOKS` from @vybora/config (core has no runtime dependency on
// config); the record makes the compiler flag a look added there, a test checks order.
const LOOK_SET: Record<Look, true> = { velvet: true, aurora: true, bloom: true };
export const APPEARANCE_LOOKS = Object.keys(LOOK_SET) as readonly Look[];

export const DEFAULT_APPEARANCE: Appearance = { look: 'velvet', mode: 'system' };

const MODE_PREFS: readonly ModePref[] = ['system', 'light', 'dark'];

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/**
 * The stored appearance, field by field: an invalid look falls back to Velvet; an
 * invalid mode falls back to the old web `vybora-theme` value (`light`/`dark`), then
 * to `system`. Never throws.
 */
export function parseAppearance(
  raw: string | null | undefined,
  legacyTheme?: string | null,
): Appearance {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const d =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return {
    look: oneOf(d.look, APPEARANCE_LOOKS) ?? DEFAULT_APPEARANCE.look,
    mode:
      oneOf(d.mode, MODE_PREFS) ??
      oneOf(legacyTheme, ['light', 'dark'] as const) ??
      DEFAULT_APPEARANCE.mode,
  };
}

export function resolveMode(pref: ModePref, systemDark: boolean): Mode {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}
