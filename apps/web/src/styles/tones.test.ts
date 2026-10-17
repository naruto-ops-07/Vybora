import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { personToneHighContrastInk, personTones } from '@vybora/config';
import { PERSON_TONES } from '@vybora/core';
import { describe, expect, it } from 'vitest';

describe('tone CSS variables mirror @vybora/config', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {\n  --vy-tone-`);
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };
  const has = (b: string, v: string, value: string) =>
    expect(b).toContain(`--vy-tone-${v}: ${value.toLowerCase()};`);

  it('light, dark and high contrast', () => {
    const light = block(':root');
    const dark = block("[data-theme='dark']");
    const hcLight = block(":root[data-contrast='high']");
    const hcDark = block(":root[data-theme='dark'][data-contrast='high']");
    for (const t of PERSON_TONES) {
      const { dark: d, light: l } = personTones[t];
      has(light, `${t}-fill`, l.fill);
      has(light, `${t}-ink`, l.ink);
      has(light, `${t}-name`, l.name);
      has(dark, `${t}-fill`, d.fill);
      has(dark, `${t}-ink`, d.ink);
      has(dark, `${t}-name`, d.name);
      has(hcLight, `${t}-ink`, personToneHighContrastInk.light);
      has(hcDark, `${t}-ink`, personToneHighContrastInk.dark);
      expect(hcLight).toContain(`--vy-tone-${t}-name: var(--vy-text);`);
      expect(hcDark).toContain(`--vy-tone-${t}-name: var(--vy-text);`);
    }
  });
});
