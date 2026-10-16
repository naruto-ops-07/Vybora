export type ReduceMotionPref = 'system' | 'on' | 'off';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

/** Per-device accessibility settings (never sent to the server). */
export interface A11yPrefs {
  reduceMotion: ReduceMotionPref;
  swipeToReply: boolean;
  haptics: boolean;
  textSize: TextSize;
  highContrast: boolean;
  alwaysShowActions: boolean;
}

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  reduceMotion: 'system',
  swipeToReply: true,
  haptics: true,
  textSize: 'md',
  highContrast: false,
  alwaysShowActions: false,
};

export const TEXT_SIZE_PX: Record<TextSize, number> = { sm: 13, md: 15, lg: 17, xl: 20 };

/** Valid for localStorage and expo-secure-store (which rejects ':'). */
export const A11Y_STORAGE_KEY = 'vybora.a11y';

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Parse stored prefs field by field; anything invalid falls back to its default. */
export function parseA11yPrefs(raw: string | null | undefined): A11yPrefs {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_A11Y_PREFS };
  const d = data as Record<string, unknown>;
  const def = DEFAULT_A11Y_PREFS;
  return {
    reduceMotion: oneOf(d.reduceMotion, ['system', 'on', 'off'] as const, def.reduceMotion),
    swipeToReply: bool(d.swipeToReply, def.swipeToReply),
    haptics: bool(d.haptics, def.haptics),
    textSize: oneOf(d.textSize, ['sm', 'md', 'lg', 'xl'] as const, def.textSize),
    highContrast: bool(d.highContrast, def.highContrast),
    alwaysShowActions: bool(d.alwaysShowActions, def.alwaysShowActions),
  };
}

export function resolveReduceMotion(pref: ReduceMotionPref, systemReduced: boolean): boolean {
  return pref === 'system' ? systemReduced : pref === 'on';
}
