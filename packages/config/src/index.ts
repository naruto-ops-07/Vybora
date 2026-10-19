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

import { palette, personTonesByLook } from './looks';

export * from './looks';

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
