import { DEFAULT_LOOK, LOOKS } from '@vybora/config';
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_KEY,
  APPEARANCE_LOOKS,
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveMode,
} from './appearance';

describe('appearance', () => {
  it('is stored per device under vybora.appearance; defaults to Velvet, match system', () => {
    expect(APPEARANCE_KEY).toBe('vybora.appearance');
    expect(DEFAULT_APPEARANCE).toEqual({ look: 'velvet', mode: 'system' });
    expect(DEFAULT_APPEARANCE.look).toBe(DEFAULT_LOOK);
    expect(APPEARANCE_LOOKS).toEqual(LOOKS);
  });

  it('falls back to the default for missing, broken or unknown values', () => {
    expect(parseAppearance(null)).toEqual({ look: 'velvet', mode: 'system' });
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{not json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('[1,2]')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('"aurora"')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{"look":"neon"}')).toEqual({ look: 'velvet', mode: 'system' });
    expect(parseAppearance('{"look":"bloom","mode":"sepia"}')).toEqual({
      look: 'bloom',
      mode: 'system',
    });
  });

  it('reads valid stored values', () => {
    expect(parseAppearance('{"look":"aurora","mode":"dark"}')).toEqual({
      look: 'aurora',
      mode: 'dark',
    });
    expect(parseAppearance(JSON.stringify({ look: 'bloom', mode: 'light', extra: 1 }))).toEqual({
      look: 'bloom',
      mode: 'light',
    });
  });

  it('takes the old light/dark key as the mode when nothing valid is stored', () => {
    expect(parseAppearance(null, 'dark')).toEqual({ look: 'velvet', mode: 'dark' });
    expect(parseAppearance('garbage', 'light')).toEqual({ look: 'velvet', mode: 'light' });
    expect(parseAppearance('{"look":"aurora"}', 'dark')).toEqual({ look: 'aurora', mode: 'dark' });
    expect(parseAppearance(null, 'sepia')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(null, null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('a valid stored value wins over the old key', () => {
    expect(parseAppearance('{"look":"bloom","mode":"light"}', 'dark')).toEqual({
      look: 'bloom',
      mode: 'light',
    });
    expect(parseAppearance('{"look":"velvet","mode":"system"}', 'dark')).toEqual({
      look: 'velvet',
      mode: 'system',
    });
  });

  it('resolves the mode: system follows the device, light and dark are fixed', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});
