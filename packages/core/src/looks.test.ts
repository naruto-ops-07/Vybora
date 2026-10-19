import {
  DEFAULT_LOOK,
  highContrastThemes,
  looks,
  LOOKS,
  personToneHighContrastInk,
  personTones,
  personTonesByLook,
  themes,
  type Look,
  type LookTokens,
  type Mode,
} from '@vybora/config';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { PERSON_TONES } from './tones';

const MODES: Mode[] = ['light', 'dark'];

/** Today's (2026-10-18) flat tokens, copied literally: Aurora must not drift from them. */
const TODAY_THEMES = {
  light: {
    bg: '#F3F6F6',
    surface: '#FFFFFF',
    surfaceMuted: '#EDF2F2',
    surfaceStrong: '#E2EAEA',
    border: '#DCE4E4',
    borderStrong: '#C2CFCF',
    text: '#0B1416',
    textMuted: '#4B5C5E',
    textSubtle: '#5F7173',
    accent: '#0F766E',
    accentHover: '#115E59',
    accentSoft: '#DDF3F0',
    onAccent: '#FFFFFF',
    bubbleIn: '#EDF2F2',
    danger: '#B42318',
    success: '#047857',
    warning: '#B45309',
  },
  dark: {
    bg: '#0A0E0F',
    surface: '#0F1517',
    surfaceMuted: '#151D1F',
    surfaceStrong: '#1B2528',
    border: '#1F2A2D',
    borderStrong: '#2E3D41',
    text: '#E6EEEE',
    textMuted: '#9AACAD',
    textSubtle: '#75898B',
    accent: '#2DD4BF',
    accentHover: '#5EEAD4',
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: '#1B2528',
    danger: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
  },
};

const tone = (dark: string, lightFill: string, lightName: string, lightInk = lightName) => ({
  dark: { fill: dark, ink: '#0A0E0F', name: dark },
  light: { fill: lightFill, ink: lightInk, name: lightName },
});
const TODAY_TONES = {
  turquoise: tone('#2DD4BF', '#99F6E4', '#0F766E', '#115E59'),
  emerald: tone('#34D399', '#A7F3D0', '#047857', '#065F46'),
  lime: tone('#A3E635', '#D9F99D', '#3F6212'),
  aqua: tone('#22D3EE', '#A5F3FC', '#0E7490', '#155E75'),
  sky: tone('#38BDF8', '#BAE6FD', '#0369A1', '#075985'),
  mint: tone('#6EE7B7', '#D1FAE5', '#065F46'),
  ocean: tone('#60A5FA', '#BFDBFE', '#1D4ED8'),
  glacier: tone('#A5B4FC', '#E0E7FF', '#4338CA'),
};

/** `rgba(r,g,b,a)` composited over an opaque `#RRGGBB`; a hex passes through. */
function over(color: string, base: string): string {
  const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) return color;
  const a = Number(m[4]);
  const b = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  return (
    '#' +
    [m[1], m[2], m[3]]
      .map((v, i) => Math.round(Number(v) * a + b[i]! * (1 - a)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Every pair that carries text (4.5:1) or bounds a control (3:1), as failure lines. */
function contrastFailures(t: LookTokens): string[] {
  const fails: string[] = [];
  const need = (fg: keyof LookTokens, bg: keyof LookTokens, min: number, bgHex = t[bg]) => {
    const r = contrastRatio(t[fg], bgHex);
    if (r < min) fails.push(`${fg} on ${bg} ${r.toFixed(2)}`);
  };
  for (const fg of ['text', 'textMuted', 'textSubtle'] as const) {
    for (const bg of ['bg', 'surface', 'surfaceMuted', 'bubbleIn'] as const) need(fg, bg, 4.5);
    need(fg, 'panel', 4.5, over(t.panel, t.bg));
  }
  need('text', 'surfaceStrong', 4.5);
  need('textMuted', 'surfaceStrong', 4.5);
  need('bubbleOutText', 'bubbleOutFrom', 4.5);
  need('bubbleOutText', 'bubbleOutTo', 4.5);
  need('onPrimary', 'primaryFrom', 4.5);
  need('onPrimary', 'primaryTo', 4.5);
  need('onAccent', 'accent', 4.5);
  need('onAccent', 'accentHover', 4.5);
  for (const fg of ['accent', 'accentHover'] as const) {
    need(fg, 'surface', 4.5);
    need(fg, 'bg', 4.5);
  }
  need('accent', 'accentSoft', 4.5);
  need('text', 'accentSoft', 4.5);
  for (const fg of ['danger', 'success', 'warning'] as const) need(fg, 'surface', 4.5);
  // Control boundaries (inputs, switches, segmented controls): WCAG 1.4.11. `border` is decorative.
  for (const bg of ['surface', 'bg', 'surfaceMuted'] as const) need('borderStrong', bg, 3);
  return fails;
}

/** The only intentional departures from today's tokens: contrast fixes (WCAG binding). */
const AURORA_CONTRAST_FIXES = {
  light: { borderStrong: '#818D8D' },
  dark: { textSubtle: '#798E90', borderStrong: '#596A6E' },
};

describe('looks', () => {
  it('lists velvet, aurora and bloom, velvet first and default', () => {
    expect(LOOKS).toEqual(['velvet', 'aurora', 'bloom']);
    expect(DEFAULT_LOOK).toBe('velvet');
    expect(Object.keys(looks)).toEqual([...LOOKS]);
  });

  it('carries the agreed names, fonts, radii, glass and ambient motion', () => {
    expect(looks.velvet).toMatchObject({
      name: 'Velvet',
      fonts: { display: 'Fraunces', text: 'DM Sans' },
      radii: { sm: 6, md: 12, lg: 18 },
      glass: false,
      ambient: 'none',
    });
    expect(looks.aurora).toMatchObject({
      name: 'Aurora',
      fonts: { display: 'Sora', text: 'Manrope' },
      radii: { sm: 8, md: 14, lg: 20 },
      glass: true,
      ambient: 'drift',
    });
    expect(looks.bloom).toMatchObject({
      name: 'Bloom',
      fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
      radii: { sm: 10, md: 16, lg: 24 },
      ambient: 'pulse',
    });
  });

  it('has three rising elevation levels per look', () => {
    for (const look of LOOKS) {
      const e = looks[look].elevation;
      expect(e[1].y).toBeLessThan(e[2].y);
      expect(e[2].y).toBeLessThan(e[3].y);
      expect(e[1].blur).toBeLessThan(e[3].blur);
      for (const level of [1, 2, 3] as const) {
        expect(e[level].alpha).toBeGreaterThan(0);
        expect(e[level].alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  for (const look of LOOKS) {
    for (const mode of MODES) {
      const t = looks[look].modes[mode];

      it(`${look} ${mode}: has every theme key plus the look keys, in the right formats`, () => {
        expect(Object.keys(t)).toEqual(
          expect.arrayContaining([
            ...Object.keys(themes.light),
            'bubbleOutFrom',
            'bubbleOutTo',
            'bubbleOutText',
            'primaryFrom',
            'primaryTo',
            'onPrimary',
            'glow1',
            'glow2',
            'glow3',
            'panel',
            'shadowColor',
          ]),
        );
        const hex = /^#[0-9A-F]{6}$/;
        const rgba = /^rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0\.\d+)\)$/;
        for (const [key, value] of Object.entries(t)) {
          if (key.startsWith('glow'))
            expect(value).toMatch(new RegExp(`${rgba.source}|^transparent$`));
          else if (key === 'panel')
            expect(value).toMatch(new RegExp(`${hex.source}|${rgba.source}`));
          else expect(value, key).toMatch(hex);
        }
        if (!looks[look].glass) expect(t.panel).toMatch(hex);
      });

      it(`${look} ${mode}: text ≥ 4.5:1 and control borders ≥ 3:1`, () => {
        expect(contrastFailures(t)).toEqual([]);
      });
    }
  }

  it('aurora keeps today’s tokens except the contrast fixes', () => {
    for (const mode of MODES) {
      const t = looks.aurora.modes[mode];
      const picked = Object.fromEntries(
        Object.keys(TODAY_THEMES[mode]).map((k) => [k, t[k as keyof LookTokens]]),
      );
      const expected = { ...TODAY_THEMES[mode], ...AURORA_CONTRAST_FIXES[mode] };
      expect(picked).toEqual(expected);
      expect(themes[mode]).toEqual(expected);
    }
  });

  it('keeps one shared high-contrast set', () => {
    expect(highContrastThemes.light.text).toBe('#0B1416');
    expect(highContrastThemes.dark.bg).toBe('#000000');
  });
});

describe('person tones per look', () => {
  it('aurora keeps today’s tones, and personTones is aurora', () => {
    expect(personTonesByLook.aurora).toEqual(TODAY_TONES);
    expect(personTones).toBe(personTonesByLook.aurora);
  });

  it('every look covers exactly the core tone names', () => {
    expect(Object.keys(personTonesByLook)).toEqual([...LOOKS]);
    for (const look of LOOKS)
      expect(Object.keys(personTonesByLook[look])).toEqual([...PERSON_TONES]);
  });

  it('velvet and bloom are their own palettes', () => {
    for (const look of ['velvet', 'bloom'] as Look[]) {
      for (const name of PERSON_TONES) {
        expect(personTonesByLook[look][name].dark.fill).not.toBe(TODAY_TONES[name].dark.fill);
      }
    }
  });

  for (const look of LOOKS) {
    for (const name of PERSON_TONES) {
      it(`${look} ${name}: names ≥ 4.5:1 on surface and bubble-in, initials ≥ 4.5:1 (7:1 in high contrast)`, () => {
        for (const mode of MODES) {
          const t = looks[look].modes[mode];
          const c = personTonesByLook[look][name][mode];
          expect(contrastRatio(c.name, t.surface)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(c.name, t.bubbleIn)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(c.ink, c.fill)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(personToneHighContrastInk[mode], c.fill)).toBeGreaterThanOrEqual(7);
        }
      });
    }
  }
});
