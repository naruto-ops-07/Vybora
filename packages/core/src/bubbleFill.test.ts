import {
  chatThemeDefs,
  highContrastThemes,
  isDefaultChatTheme,
  LOOKS,
  looks,
  outgoingBubbleFill,
  THEME_ORDER,
} from '@vybora/config';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

const MODES = ['light', 'dark'] as const;

describe('outgoingBubbleFill', () => {
  it('the Default chat theme is the look’s own gradient bubble, in every look and mode', () => {
    for (const look of LOOKS)
      for (const mode of MODES) {
        const t = looks[look].modes[mode];
        for (const theme of [null, undefined, {}, { preset: null }, { preset: 'aurora' }]) {
          const fill = outgoingBubbleFill(theme, look, mode);
          expect(fill).toEqual({
            gradient: true,
            from: t.bubbleOutFrom,
            to: t.bubbleOutTo,
            text: t.bubbleOutText,
            angle: look === 'velvet' ? 180 : 135,
          });
        }
      }
  });

  it('a named chat theme keeps its own colour, flat (from = to), in every look', () => {
    for (const look of LOOKS)
      for (const mode of MODES)
        for (const preset of THEME_ORDER.filter((p) => p !== 'aurora')) {
          const def = chatThemeDefs[preset]!;
          const fill = outgoingBubbleFill({ preset }, look, mode);
          expect(fill.gradient).toBe(false);
          expect(fill.from).toBe(def.bubble);
          expect(fill.to).toBe(def.bubble);
          expect(fill.text).toBe(def.bubbleText);
        }
  });

  it('an unknown preset falls back to the Default bubble', () => {
    expect(outgoingBubbleFill({ preset: 'sepia' }, 'bloom', 'dark')).toEqual(
      outgoingBubbleFill(null, 'bloom', 'dark'),
    );
  });

  it('high contrast is flat: the high-contrast accent with its own ink, whatever the theme', () => {
    for (const mode of MODES) {
      const hc = highContrastThemes[mode];
      for (const theme of [null, { preset: 'ocean' }])
        for (const look of LOOKS)
          expect(outgoingBubbleFill(theme, look, mode, { highContrast: true })).toEqual({
            gradient: false,
            from: hc.accent,
            to: hc.accent,
            text: hc.onAccent,
            angle: look === 'velvet' ? 180 : 135,
          });
    }
  });

  it('every fill keeps its text ≥ 4.5:1 on both stops (≥ 7:1 in high contrast)', () => {
    for (const look of LOOKS)
      for (const mode of MODES) {
        for (const preset of THEME_ORDER) {
          const f = outgoingBubbleFill({ preset }, look, mode);
          expect(contrastRatio(f.text, f.from), `${look} ${mode} ${preset}`).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(contrastRatio(f.text, f.to), `${look} ${mode} ${preset}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
        const hc = outgoingBubbleFill(null, look, mode, { highContrast: true });
        expect(contrastRatio(hc.text, hc.from)).toBeGreaterThanOrEqual(7);
      }
  });

  it('names the Default theme', () => {
    expect(isDefaultChatTheme(null)).toBe(true);
    expect(isDefaultChatTheme({})).toBe(true);
    expect(isDefaultChatTheme({ preset: 'aurora' })).toBe(true);
    expect(isDefaultChatTheme({ preset: 'ocean' })).toBe(false);
    expect(chatThemeDefs.aurora!.label).toBe('Default');
  });
});
