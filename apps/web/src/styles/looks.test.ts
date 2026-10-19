import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  highContrastThemes,
  LOOKS,
  looks,
  personToneHighContrastInk,
  personTonesByLook,
  type LookTokens,
  type Mode,
} from '@vybora/config';
import { PERSON_TONES } from '@vybora/core';
import { describe, expect, it } from 'vitest';

const web = process.cwd();
const repo = resolve(web, '../..');
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const css = read(resolve(web, 'src/styles/looks.generated.css'));
const indexCss = read(resolve(web, 'src/styles/index.css'));

/** The declarations of the rule whose selector list is exactly `selector`. */
function block(selector: string) {
  // Every rule follows its comment line, so a suffix of a longer selector list can't match.
  const start = css.indexOf(`*/\n${selector} {\n`) + 3;
  expect(start, selector).toBeGreaterThan(2);
  return css.slice(start + selector.length + 3, css.indexOf('\n}', start));
}
const decl = (b: string, name: string) => {
  // Prettier may wrap a long value onto the next line.
  const m = new RegExp(`^  --vy-${name}:\\s+([^;]+);$`, 'm').exec(b);
  return m?.[1]?.replace(/\s+/g, ' ');
};

const lightSelector = (look: string) =>
  look === 'velvet' ? `:where(:root),\n[data-look='velvet']` : `[data-look='${look}']`;
const darkSelector = (look: string) =>
  (look === 'velvet' ? `:where(:root[data-theme='dark']),\n` : '') +
  `[data-look='${look}'][data-theme='dark'],\n[data-theme='dark'] [data-look='${look}']`;
const HC_LIGHT = `:root[data-contrast='high'],\n:root[data-contrast='high'] [data-look]`;
const HC_DARK = `:root[data-contrast='high'][data-theme='dark'],\n:root[data-contrast='high'][data-theme='dark'] [data-look]`;

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const squash = (v: string | undefined) => v?.replace(/\s+/g, '').toLowerCase();
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
const kebab = (k: string) =>
  k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\d)$/, '-$1');
const TOKEN_VARS: Partial<Record<keyof LookTokens, string>> = {
  border: 'border',
  borderStrong: 'border-strong',
  textMuted: 'text-muted',
  textSubtle: 'text-subtle',
};

describe('looks.generated.css', () => {
  it('is exactly what scripts/gen-look-css.mjs prints (run `pnpm theme:css`)', () => {
    const out = execFileSync(
      process.execPath,
      [resolve(repo, 'scripts/gen-look-css.mjs'), '--stdout'],
      {
        encoding: 'utf8',
      },
    );
    expect(out.replace(/\r\n/g, '\n')).toBe(css);
  });

  it('has a light and a dark block for every look, with every token', () => {
    for (const look of LOOKS) {
      const def = looks[look];
      for (const mode of ['light', 'dark'] as Mode[]) {
        const b = block(mode === 'light' ? lightSelector(look) : darkSelector(look));
        const t = def.modes[mode];
        for (const [key, value] of Object.entries(t) as [keyof LookTokens, string][]) {
          if (key === 'shadowColor') continue;
          const name = TOKEN_VARS[key] ?? kebab(key);
          expect(squash(decl(b, name)), `${look} ${mode} ${name}`).toBe(squash(value));
        }
        expect(decl(b, 'text')).toBe(t.text.toLowerCase());
        for (const level of [1, 2, 3] as const) {
          const e = def.elevation[level];
          expect(decl(b, `shadow-${level}`), `${look} ${mode} shadow-${level}`).toBe(
            `0 ${e.y}px ${e.blur}px ${rgba(t.shadowColor, e.alpha)}`,
          );
        }
        for (const tone of PERSON_TONES) {
          const c = personTonesByLook[look][tone][mode];
          expect(decl(b, `tone-${tone}-fill`)).toBe(c.fill.toLowerCase());
          expect(decl(b, `tone-${tone}-ink`)).toBe(c.ink.toLowerCase());
          expect(decl(b, `tone-${tone}-name`)).toBe(c.name.toLowerCase());
        }
        expect(b).toContain(`color-scheme: ${mode};`);
        for (const soft of ['danger-soft', 'warning-soft', 'scrim'])
          expect(decl(b, soft)).toBeTruthy();
      }
      // Shape and type are the same in both modes: declared once, in the light block.
      const shared = block(lightSelector(look));
      expect(decl(shared, 'radius-sm')).toBe(`${def.radii.sm}px`);
      expect(decl(shared, 'radius-md')).toBe(`${def.radii.md}px`);
      expect(decl(shared, 'radius-lg')).toBe(`${def.radii.lg}px`);
      expect(decl(shared, 'font-display')).toContain(`'${def.fonts.display} Variable'`);
      expect(decl(shared, 'font-text')).toContain(`'${def.fonts.text} Variable'`);
    }
  });

  it('popovers: solid where the look has no glass, a translucent surface where it has', () => {
    for (const look of LOOKS) {
      const def = looks[look];
      const shared = block(lightSelector(look));
      expect(decl(shared, 'primary-angle')).toBe(look === 'velvet' ? '180deg' : '135deg');
      // Velvet's 1 px inner top highlight on the primary button; a no-op elsewhere.
      expect(decl(shared, 'primary-highlight')).toBe(
        look === 'velvet' ? 'inset 0 1px 0 rgba(255, 255, 255, 0.45)' : '0 0 #0000',
      );
      for (const mode of ['light', 'dark'] as Mode[]) {
        const b = block(mode === 'light' ? lightSelector(look) : darkSelector(look));
        const t = def.modes[mode];
        const popover = decl(b, 'popover')!;
        const edge = decl(b, 'edge')!;
        if (def.glass) {
          expect(popover, `${look} ${mode}`).toBe(rgba(t.surface, 0.84));
          expect(edge).toBe(mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : t.border.toLowerCase());
        } else {
          expect(popover, `${look} ${mode}`).toBe(t.surface.toLowerCase());
          // A hairline gold-tinted top edge: 35 % accent over the border.
          expect(edge).toMatch(/^#[0-9a-f]{6}$/);
          expect(edge).not.toBe(t.border.toLowerCase());
        }
      }
    }
  });

  it('button hover and pressed fills keep their text ≥ 4.5:1 (≥ 7:1 in high contrast)', () => {
    const sets = [
      ...LOOKS.flatMap((look) =>
        (['light', 'dark'] as Mode[]).map((mode) => ({
          name: `${look} ${mode}`,
          b: block(mode === 'light' ? lightSelector(look) : darkSelector(look)),
          floor: 4.5,
        })),
      ),
      { name: 'high contrast light', b: block(HC_LIGHT), floor: 7 },
      { name: 'high contrast dark', b: block(HC_DARK), floor: 7 },
    ];
    for (const { name, b, floor } of sets) {
      const onPrimary = decl(b, 'on-primary')!;
      for (const v of ['from', 'to'])
        for (const state of ['primary', 'primary-hover', 'primary-press']) {
          const fill = decl(b, `${state}-${v}`)!;
          expect(contrast(onPrimary, fill), `${name} ${state}-${v}`).toBeGreaterThanOrEqual(floor);
        }
      const bg = decl(b, 'bg')!;
      for (const state of ['danger', 'danger-hover', 'danger-press'])
        expect(contrast(bg, decl(b, state)!), `${name} ${state}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('danger and warning text stay ≥ 4.5:1 on their soft fills, in every look × mode', () => {
    for (const look of LOOKS)
      for (const mode of ['light', 'dark'] as Mode[]) {
        const b = block(mode === 'light' ? lightSelector(look) : darkSelector(look));
        const t = looks[look].modes[mode];
        expect(
          contrast(t.danger, decl(b, 'danger-soft')!),
          `${look} ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(t.warning, decl(b, 'warning-soft')!),
          `${look} ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(t.text, decl(b, 'warning-soft')!),
          `${look} ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('keeps Aurora’s soft fills and scrims at today’s values', () => {
    const light = block(lightSelector('aurora'));
    const dark = block(darkSelector('aurora'));
    expect(decl(light, 'danger-soft')).toBe('#fdecea');
    expect(decl(light, 'warning-soft')).toBe('#fdf3e2');
    expect(decl(light, 'scrim')).toBe('rgb(11 20 22 / 0.55)');
    expect(decl(dark, 'danger-soft')).toBe('#2a1414');
    expect(decl(dark, 'warning-soft')).toBe('#2a2110');
    expect(decl(dark, 'scrim')).toBe('rgb(0 0 0 / 0.6)');
  });

  it('high contrast is flat in every look: no gradient stops, no glow, no shadow', () => {
    for (const [selector, mode] of [
      [HC_LIGHT, 'light'],
      [HC_DARK, 'dark'],
    ] as const) {
      const b = block(selector);
      const t = highContrastThemes[mode];
      expect(b).not.toMatch(/gradient/i);
      // Visually none, but still a valid item in a box-shadow list, so rings composed with
      // it (Tailwind's ring-* + shadow) survive high contrast.
      for (const level of [1, 2, 3]) expect(decl(b, `shadow-${level}`)).toBe('0 0 #0000');
      expect(decl(b, 'primary-highlight')).toBe('0 0 #0000');
      expect(decl(b, 'popover')).toBe(t.surface.toLowerCase());
      expect(decl(b, 'edge')).toBe(t.border.toLowerCase());
      expect(decl(b, 'bubble-out-from')).toBe(decl(b, 'bubble-out-to'));
      expect(decl(b, 'primary-from')).toBe(decl(b, 'primary-to'));
      expect(decl(b, 'bubble-out-from')).toBe(t.accent.toLowerCase());
      expect(decl(b, 'bubble-out-text')).toBe(t.onAccent.toLowerCase());
      expect(decl(b, 'on-primary')).toBe(t.onAccent.toLowerCase());
      for (const g of [1, 2, 3]) expect(decl(b, `glow-${g}`)).toBe('transparent');
      expect(decl(b, 'panel')).toBe(t.surface.toLowerCase());
      expect(decl(b, 'panel-blur')).toBe('0px');
      expect(decl(b, 'text')).toBe(t.text.toLowerCase());
      for (const tone of PERSON_TONES) {
        expect(decl(b, `tone-${tone}-ink`)).toBe(personToneHighContrastInk[mode].toLowerCase());
        expect(decl(b, `tone-${tone}-name`)).toBe('var(--vy-text)');
      }
    }
    // Nothing outside the high-contrast blocks can re-introduce a shadow or glow there:
    // they outrank every look block (specificity 0,2,0 / 0,3,0 against at most 0,2,0).
    expect(css.lastIndexOf(HC_DARK)).toBeGreaterThan(css.lastIndexOf(darkSelector('bloom')));
  });
});

describe('index.css', () => {
  it('imports the generated looks and maps Tailwind to them', () => {
    expect(indexCss).toContain("@import './looks.generated.css';");
    expect(indexCss).toContain('--radius-sm: var(--vy-radius-sm);');
    expect(indexCss).toContain('--radius-md: var(--vy-radius-md);');
    expect(indexCss).toContain('--radius-lg: var(--vy-radius-lg);');
    expect(indexCss).toContain('--shadow-sm: var(--vy-shadow-1);');
    expect(indexCss).toContain('--shadow-md: var(--vy-shadow-2);');
    expect(indexCss).toContain('--shadow-lg: var(--vy-shadow-3);');
    expect(indexCss).toMatch(/--font-sans: var\(--vy-font-text\);/);
    expect(indexCss).toMatch(/--font-display: var\(--vy-font-display\);/);
    expect(indexCss).toMatch(/--font-mono: 'IBM Plex Mono'/);
    expect(indexCss).toContain('@utility bg-primary-gradient');
    expect(indexCss).toContain('@utility bg-bubble-out');
    expect(indexCss).toContain('@utility shadow-1');
    expect(indexCss).toContain('--color-on-primary: var(--vy-on-primary);');
  });

  it('drops the flat-only rules and Archivo', () => {
    expect(indexCss).not.toMatch(/--shadow-[a-z0-9]+: none/);
    expect(indexCss).not.toContain('--radius-2xl');
    expect(indexCss).not.toMatch(/no gradients/i);
    expect(indexCss).not.toContain('Archivo');
    // Colour tokens now live only in the generated file.
    expect(indexCss).not.toMatch(/--vy-bg:/);
  });
});
