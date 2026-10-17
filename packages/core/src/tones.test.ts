import { personToneHighContrastInk, personTones } from '@vybora/config';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { initialsFor, PERSON_TONES, personTone } from './tones';

/** Deterministic uuid-shaped ids (mulberry32), so the distribution test never flakes. */
function uuids(count: number, seed = 0x5eed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
  return Array.from(
    { length: count },
    () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(rand() * 4)]}${hex(3)}-${hex(12)}`,
  );
}

describe('personTone', () => {
  it('has eight tones in the spec order', () => {
    expect(PERSON_TONES).toEqual([
      'turquoise',
      'emerald',
      'lime',
      'aqua',
      'sky',
      'mint',
      'ocean',
      'glacier',
    ]);
  });

  it('is deterministic: FNV-1a 32-bit of the id, mod 8', () => {
    // FNV-1a("") = 0x811c9dc5 → 5 → mint; FNV-1a("a") = 0xe40c292c → 4 → sky.
    expect(personTone('')).toBe('mint');
    expect(personTone('a')).toBe('sky');
    const id = '6f1c2a9e-1b7d-4c3a-9f0e-2d5b8a7c4e11';
    expect(personTone(id)).toBe(personTone(id));
    expect(PERSON_TONES).toContain(personTone(id));
  });

  it('spreads 10k random uuids across every tone (9–16 % each)', () => {
    const counts = new Map<string, number>();
    for (const id of uuids(10_000)) {
      const t = personTone(id);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const tone of PERSON_TONES) {
      const share = (counts.get(tone) ?? 0) / 10_000;
      expect(share).toBeGreaterThanOrEqual(0.09);
      expect(share).toBeLessThanOrEqual(0.16);
    }
  });
});

describe('initialsFor', () => {
  it('uses the first and last word of the display name', () => {
    expect(initialsFor('Maya Chen', 'maya')).toBe('MC');
    expect(initialsFor('  maya   van der berg ', 'maya')).toBe('MB');
    expect(initialsFor('Léa', 'lea')).toBe('L');
  });

  it('falls back to the username, split on . _ -', () => {
    expect(initialsFor(null, 'maya')).toBe('M');
    expect(initialsFor('', 'maya_chen')).toBe('MC');
    expect(initialsFor('   ', 'jo.ann-lee')).toBe('JL');
    expect(initialsFor(undefined, '@sam')).toBe('S');
  });

  it('skips leading symbols and keeps whole characters', () => {
    expect(initialsFor('(Ana) 🌊 Ruiz', 'ana')).toBe('AR');
    expect(initialsFor('Émile Zola', 'ez')).toBe('ÉZ');
    expect(initialsFor('42 club', 'x')).toBe('4C');
    expect(initialsFor('𝒜lex', 'alex')).toBe('𝒜');
  });

  it('keeps only the first initial when asked', () => {
    expect(initialsFor('Maya Chen', 'maya', 1)).toBe('M');
    expect(initialsFor('Émile Zola', 'ez', 1)).toBe('É');
  });

  it('returns ? when nothing usable is left', () => {
    expect(initialsFor('', '')).toBe('?');
    expect(initialsFor('🌊', '___')).toBe('?');
  });
});

describe('person tone tokens', () => {
  it('cover exactly the core tone names', () => {
    expect(Object.keys(personTones)).toEqual([...PERSON_TONES]);
  });

  for (const tone of PERSON_TONES) {
    const { dark, light } = personTones[tone];
    it(`${tone}: names ≥ 4.5:1 on surfaces and bubbles, initials ≥ 4.5:1 on fill`, () => {
      // Dark: names sit on bubble-in (#1B2528) and surface (#0F1517).
      expect(contrastRatio(dark.name, '#1B2528')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.name, '#0F1517')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.ink, dark.fill)).toBeGreaterThanOrEqual(4.5);
      // Light: names on white surface and #EDF2F2 bubble-in.
      expect(contrastRatio(light.name, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.name, '#EDF2F2')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.ink, light.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tone}: high-contrast initials ≥ 7:1 on fill`, () => {
      expect(contrastRatio(personToneHighContrastInk.dark, dark.fill)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(personToneHighContrastInk.light, light.fill)).toBeGreaterThanOrEqual(7);
    });
  }
});
