import {
  highContrastThemes,
  iconSizes,
  looks,
  radii,
  spacing,
  type Elevation,
  type Look,
  type LookDef,
  type LookTokens,
  type Mode,
} from '@vybora/config';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { useA11y } from './a11y';
import { useAppearance } from './appearance';
import { lookFonts, type LookFonts } from './fonts';

/**
 * The tokens in effect: the active look in the resolved mode, or the flat high-contrast
 * set (no gradient, glow, glass or shadow) when Accessibility → High contrast is on.
 */
export interface Theme extends LookTokens {
  dark: boolean;
  look: Look;
  highContrast: boolean;
  fonts: LookFonts;
  radii: LookDef['radii'];
  elevation: LookDef['elevation'];
  /** Frosted panels. Mobile has no blur: glass surfaces use `panel` / `popover` as is. */
  glass: boolean;
  ambient: LookDef['ambient'];
  /** Menus, sheets and toasts: a solid surface (no blur on mobile to read through). */
  popover: string;
  /** Gradient direction: Velvet runs top → bottom, the others corner to corner. */
  gradientAngle: 180 | 135;
  /** Pressed primary stops and danger fill, moved away from their text (contrast only rises). */
  primaryPressFrom: string;
  primaryPressTo: string;
  dangerPress: string;
  /** Text on a danger fill: the page colour (≥ 4.5:1 in every look, mode and contrast). */
  onDanger: string;
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `amount` of `fg` over `bg`, as hex. */
const mix = (fg: string, bg: string, amount: number) =>
  '#' +
  hexRgb(fg)
    .map((c, i) => Math.round(c * amount + hexRgb(bg)[i]! * (1 - amount)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
const luminance = (hex: string) => {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** Mirrors web's generated press fills: lighter under dark text, darker under light. */
const away = (fill: string, text: string, amount: number) =>
  mix(luminance(text) < 0.18 ? '#FFFFFF' : '#000000', fill, amount);

const cache = new Map<string, Theme>();

/** Pure and cached per look × mode × contrast, so `useTheme()` is referentially stable. */
export function themeFor(look: Look, mode: Mode, highContrast: boolean): Theme {
  const key = `${look}.${mode}.${highContrast ? 'hc' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = looks[look];
  let tokens: LookTokens;
  if (highContrast) {
    const t = highContrastThemes[mode];
    tokens = {
      ...t,
      bubbleOutFrom: t.accent,
      bubbleOutTo: t.accent,
      bubbleOutText: t.onAccent,
      primaryFrom: t.accent,
      primaryTo: t.accent,
      onPrimary: t.onAccent,
      glow1: 'transparent',
      glow2: 'transparent',
      glow3: 'transparent',
      panel: t.surface,
      shadowColor: 'transparent',
    };
  } else tokens = def.modes[mode];
  const theme: Theme = {
    ...tokens,
    dark: mode === 'dark',
    look,
    highContrast,
    fonts: lookFonts[look],
    radii: def.radii,
    elevation: def.elevation,
    glass: highContrast ? false : def.glass,
    ambient: highContrast ? 'none' : def.ambient,
    popover: tokens.surface,
    gradientAngle: look === 'velvet' ? 180 : 135,
    primaryPressFrom: highContrast
      ? tokens.accentHover
      : away(tokens.primaryFrom, tokens.onPrimary, 0.16),
    primaryPressTo: highContrast
      ? tokens.accentHover
      : away(tokens.primaryTo, tokens.onPrimary, 0.16),
    dangerPress: away(tokens.danger, tokens.bg, 0.16),
    onDanger: tokens.bg,
  };
  cache.set(key, theme);
  return theme;
}

const LookScopeCtx = createContext<Look | null>(null);

/**
 * Renders its children in another look (the Appearance previews), in the current mode
 * and contrast. The mobile counterpart of web's scoped `data-look`.
 */
export function LookScope({ look, children }: { look: Look; children: ReactNode }) {
  return createElement(LookScopeCtx.Provider, { value: look }, children);
}

export function useTheme(): Theme {
  const { look, resolved } = useAppearance();
  const scoped = useContext(LookScopeCtx);
  const { prefs } = useA11y();
  return themeFor(scoped ?? look, resolved, prefs.highContrast);
}

/** The active look's family names per weight; mono is the same in every look. */
export function useFonts(): LookFonts {
  return useTheme().fonts;
}

/** Android elevation per level (its shadow is drawn by the system, tinted where supported). */
const ANDROID_ELEVATION: Record<1 | 2 | 3, number> = { 1: 3, 2: 8, 3: 16 };

/**
 * Soft depth at a level (1: bubbles, buttons, cards; 2: menus, toasts; 3: dialogs,
 * sheets) from the look's elevation and `shadowColor`: iOS shadow props, Android
 * `elevation`. One alpha per level, as on web. Empty under high contrast.
 */
export function shadowStyle(level: 1 | 2 | 3, t: Theme): ViewStyle {
  if (t.highContrast) return {};
  const e: Elevation = t.elevation[level];
  return Platform.select<ViewStyle>({
    android: { elevation: ANDROID_ELEVATION[level], shadowColor: t.shadowColor },
    default: {
      shadowColor: t.shadowColor,
      shadowOpacity: e.alpha,
      shadowRadius: e.blur / 2,
      shadowOffset: { width: 0, height: e.y },
    },
  });
}

/** A hex colour at `alpha` (two hex digits): ink tints for pressed states on any surface. */
export const tint = (hex: string, alpha: string) => `${hex.slice(0, 7)}${alpha}`;

/** Legacy radii for screens not yet restyled; primitives use `useTheme().radii`. */
export { iconSizes, radii, spacing };

/** Mono faces (data only), the same in every look. Text faces: `useFonts()`. */
export const font = {
  mono: lookFonts.velvet.mono,
  monoMedium: lookFonts.velvet.monoMedium,
} as const;
