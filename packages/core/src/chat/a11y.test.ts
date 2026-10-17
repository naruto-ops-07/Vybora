import { highContrastThemes } from '@vybora/config';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { DEFAULT_A11Y_PREFS, parseA11yPrefs, resolveReduceMotion } from './a11y';

describe('parseA11yPrefs', () => {
  it('returns defaults for missing or broken storage', () => {
    expect(parseA11yPrefs(null)).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('not json')).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('[1,2]')).toEqual(DEFAULT_A11Y_PREFS);
  });

  it('keeps valid fields and replaces invalid ones one by one', () => {
    expect(
      parseA11yPrefs(
        JSON.stringify({
          textSize: 'xl',
          highContrast: true,
          reduceMotion: 'sometimes',
          haptics: 'yes',
          extra: 1,
        }),
      ),
    ).toEqual({ ...DEFAULT_A11Y_PREFS, textSize: 'xl', highContrast: true });
  });
});

describe('resolveReduceMotion', () => {
  it('lets the setting override the system in both directions', () => {
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
    expect(resolveReduceMotion('on', false)).toBe(true);
    expect(resolveReduceMotion('off', true)).toBe(false);
  });
});

const contrast = contrastRatio;

describe('high-contrast themes', () => {
  for (const name of ['light', 'dark'] as const) {
    const t = highContrastThemes[name];
    it(`${name}: text 7:1, secondary 4.5:1, borders 3:1`, () => {
      expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.text, t.bubbleIn)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.textMuted, t.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.textSubtle, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.border, t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.danger, t.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
