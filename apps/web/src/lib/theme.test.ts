import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOOKS, looks } from '@vybora/config';
import { APPEARANCE_KEY } from '@vybora/core';
import { describe, expect, it } from 'vitest';
import { initialAppearance, LEGACY_THEME_KEY, THEME_COLORS } from './theme';

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const prePaint = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]!)
  .find((s) => s.includes(APPEARANCE_KEY));

type Store = Record<string, string> | 'throws';

/** Runs the inline index.html script against a fake page; returns what it set. */
function runInline(store: Store, systemDark: boolean | 'missing') {
  const attrs: Record<string, string> = {};
  const meta = { content: '#000000', setAttribute: (_: string, v: string) => (meta.content = v) };
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    querySelector: (q: string) => (q === 'meta[name="theme-color"]' ? meta : null),
  };
  const localStorage = {
    getItem: (k: string) => {
      if (store === 'throws') throw new Error('SecurityError');
      return store[k] ?? null;
    },
  };
  const matchMedia =
    systemDark === 'missing'
      ? undefined
      : (q: string) => ({ matches: q.includes('dark') && systemDark });
  new Function('document', 'localStorage', 'matchMedia', prePaint!)(
    document,
    localStorage,
    matchMedia,
  );
  return { look: attrs['data-look'], theme: attrs['data-theme'], color: meta.content };
}

function runFn(store: Store, systemDark: boolean | 'missing') {
  const r = initialAppearance(
    (k) => {
      if (store === 'throws') throw new Error('SecurityError');
      return store[k] ?? null;
    },
    () => {
      if (systemDark === 'missing') throw new ReferenceError('matchMedia');
      return systemDark;
    },
  );
  return { look: r.look, theme: r.theme, color: r.color };
}

const CASES: Store[] = [
  {},
  'throws',
  { [APPEARANCE_KEY]: '{"look":"aurora","mode":"dark"}' },
  { [APPEARANCE_KEY]: '{"look":"bloom","mode":"light"}' },
  { [APPEARANCE_KEY]: '{"look":"bloom","mode":"system"}' },
  { [APPEARANCE_KEY]: '{"look":"neon","mode":"dark"}' },
  { [APPEARANCE_KEY]: '{"look":"aurora","mode":"dim"}', [LEGACY_THEME_KEY]: 'light' },
  { [APPEARANCE_KEY]: '{"look":"aurora","mode":"light"}', [LEGACY_THEME_KEY]: 'dark' },
  { [APPEARANCE_KEY]: '{"look":"constructor"}' },
  { [APPEARANCE_KEY]: '{"look":"toString","mode":"dark"}' },
  { [APPEARANCE_KEY]: '{not json' },
  { [APPEARANCE_KEY]: '["aurora"]' },
  { [APPEARANCE_KEY]: 'null' },
  { [APPEARANCE_KEY]: '42' },
  { [APPEARANCE_KEY]: '' },
  { [LEGACY_THEME_KEY]: 'dark' },
  { [LEGACY_THEME_KEY]: 'light' },
  { [LEGACY_THEME_KEY]: 'system' },
  { [LEGACY_THEME_KEY]: 'sepia' },
];

describe('pre-paint script (index.html)', () => {
  it('exists, inline in <head>, before the app bundle', () => {
    expect(prePaint).toBeDefined();
    expect(indexHtml.indexOf(APPEARANCE_KEY)).toBeLessThan(indexHtml.indexOf('</head>'));
  });

  it('gives the same look, mode and theme colour as initialAppearance()', () => {
    for (const store of CASES)
      for (const dark of [true, false, 'missing'] as const)
        expect(runInline(store, dark), JSON.stringify({ store, dark })).toEqual(runFn(store, dark));
  });

  it('never throws, even without storage or matchMedia', () => {
    expect(runInline('throws', 'missing')).toEqual({
      look: 'velvet',
      theme: 'light',
      color: looks.velvet.modes.light.bg,
    });
  });

  it('carries every look’s background as the theme colour', () => {
    for (const look of LOOKS)
      for (const mode of ['light', 'dark'] as const) {
        expect(THEME_COLORS[look][mode]).toBe(looks[look].modes[mode].bg);
        const store = { [APPEARANCE_KEY]: JSON.stringify({ look, mode }) };
        expect(runInline(store, false).color).toBe(looks[look].modes[mode].bg);
      }
  });

  it('loads no web fonts from Google', () => {
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
  });
});
