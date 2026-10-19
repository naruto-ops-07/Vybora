/**
 * VYBORA design tokens — the single source of truth for color, type, spacing,
 * radii and motion. Web mirrors them as CSS variables
 * (apps/web/src/styles/index.css); mobile consumes them directly.
 * Rules and rationale: docs/DESIGN_SYSTEM.md.
 *
 * Colour lives per look (Velvet, Aurora, Bloom) × mode in `./looks`, with
 * gradients, glows and elevation. High contrast is one flat set shared by
 * every look: no gradients, no shadows.
 */

import { palette, personTonesByLook, type ThemeTokens } from './looks';

export * from './looks';

/**
 * Accessibility → High contrast. Same keys as `themes`; text ≥ 7:1, secondary
 * text ≥ 4.5:1 and borders ≥ 3:1 against surfaces (checked in core tests).
 */
export const highContrastThemes: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    bg: palette.white,
    surface: palette.white,
    surfaceMuted: '#F1F5F5',
    surfaceStrong: palette.mist200,
    border: palette.slate600,
    borderStrong: palette.graphite700,
    text: palette.ink,
    textMuted: palette.graphite700,
    textSubtle: '#3E4F52',
    accent: palette.teal800,
    accentHover: palette.tealDeep,
    accentSoft: '#CDEDEA',
    onAccent: palette.white,
    bubbleIn: palette.mist200,
    danger: '#8F1B12',
    success: '#065F46',
    warning: '#7C3A06',
  },
  dark: {
    bg: '#000000',
    surface: palette.graphite950,
    surfaceMuted: palette.graphite850,
    surfaceStrong: palette.graphite750,
    border: palette.graphite500,
    borderStrong: palette.graphite400,
    text: palette.white,
    textMuted: '#C9D6D6',
    textSubtle: '#AFC0C1',
    accent: palette.turquoiseLight,
    accentHover: '#99F6E4',
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: palette.graphite750,
    danger: '#FCA5A5',
    success: '#6EE7B7',
    warning: '#FCD34D',
  },
};

/** Legacy radii (small controls, standard controls, panels/bubbles); looks carry their own. */
export const radii = { sm: 4, md: 8, lg: 12 } as const;

/** 4-pt rhythm. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const typography = {
  sans: 'Archivo',
  mono: 'IBM Plex Mono',
  /** Compact scale for a messaging interface. */
  sizes: { xs: 12, sm: 13, base: 15, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 36 },
  weights: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

/** Icon sizes (Phosphor, "regular" weight ≈ 1.5px stroke at 24). */
export const iconSizes = { sm: 16, md: 20, lg: 24 } as const;

/** Motion is functional only: opacity/colour transitions, no lift or scale. */
export const motion = { fast: 120, base: 180 } as const;

/** Today's tones (Aurora's). Prefer `personTonesByLook[look]`. */
export const personTones = personTonesByLook.aurora;

/** High contrast keeps tone fills; initials switch to the theme ink for ≥ 7:1. */
export const personToneHighContrastInk = { light: palette.ink, dark: palette.graphite950 } as const;

export * from './chat';
