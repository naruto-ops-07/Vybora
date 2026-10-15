/**
 * VYBORA design tokens — the single source of truth for color, type, spacing,
 * radii and motion. Web mirrors them as CSS variables
 * (apps/web/src/styles/index.css); mobile consumes them directly.
 * Rules and rationale: docs/DESIGN_SYSTEM.md.
 *
 * Visual language: midnight graphite + deep teal, turquoise/emerald accents
 * used sparingly. Flat surfaces separated by borders and tone — no gradients,
 * no shadows.
 */

export const palette = {
  graphite950: '#0A0E0F',
  graphite900: '#0F1517',
  graphite850: '#151D1F',
  graphite800: '#1B2528',
  graphite750: '#1F2A2D',
  graphite700: '#2E3D41',
  graphite500: '#75898B',
  graphite400: '#9AACAD',
  graphite100: '#E6EEEE',
  mist50: '#F3F6F6',
  mist100: '#EDF2F2',
  mist200: '#E2EAEA',
  mist300: '#DCE4E4',
  mist400: '#C2CFCF',
  slate600: '#5F7173',
  slate700: '#4B5C5E',
  ink: '#0B1416',
  white: '#FFFFFF',
  turquoise: '#2DD4BF',
  turquoiseLight: '#5EEAD4',
  teal700: '#0F766E',
  teal800: '#115E59',
  tealDeep: '#0F4C47',
  emerald: '#34D399',
  emeraldDeep: '#047857',
} as const;

export const themes = {
  light: {
    bg: palette.mist50,
    surface: palette.white,
    surfaceMuted: palette.mist100,
    surfaceStrong: palette.mist200,
    border: palette.mist300,
    borderStrong: palette.mist400,
    text: palette.ink,
    textMuted: palette.slate700,
    textSubtle: palette.slate600,
    accent: palette.teal700,
    accentHover: palette.teal800,
    accentSoft: '#DDF3F0',
    onAccent: palette.white,
    bubbleIn: palette.mist100,
    danger: '#B42318',
    success: palette.emeraldDeep,
    warning: '#B45309',
  },
  dark: {
    bg: palette.graphite950,
    surface: palette.graphite900,
    surfaceMuted: palette.graphite850,
    surfaceStrong: palette.graphite800,
    border: palette.graphite750,
    borderStrong: palette.graphite700,
    text: palette.graphite100,
    textMuted: palette.graphite400,
    textSubtle: palette.graphite500,
    accent: palette.turquoise,
    accentHover: palette.turquoiseLight,
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: palette.graphite800,
    danger: '#F87171',
    success: palette.emerald,
    warning: '#FBBF24',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeTokens = { [K in keyof (typeof themes)['light']]: string };

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

/** Three radii only: small controls, standard controls, panels/bubbles. */
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

export * from './chat';
