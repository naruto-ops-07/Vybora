/**
 * Personal tones: every person gets one of eight colours, derived from their
 * user id so it is the same on every device and session. Tones are identity,
 * never status — they colour avatars, group sender names and mentions only.
 * Colour values live in `personTones` (`@vybora/config`).
 */
export const PERSON_TONES = [
  'turquoise',
  'emerald',
  'lime',
  'aqua',
  'sky',
  'mint',
  'ocean',
  'glacier',
] as const;

export type ToneName = (typeof PERSON_TONES)[number];

/** FNV-1a 32-bit over the id's UTF-16 code units, mod 8. */
export function personTone(userId: string): ToneName {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PERSON_TONES[h % PERSON_TONES.length]!;
}

// First letter or digit of a word, with any combining marks that follow it.
const FIRST_CHAR = /[\p{L}\p{N}]\p{M}*/u;

function initialsOf(words: string[], max: 1 | 2): string {
  const firsts = words.map((w) => w.match(FIRST_CHAR)?.[0]).filter((c): c is string => !!c);
  if (!firsts.length) return '';
  const picked =
    firsts.length > 1 && max > 1 ? [firsts[0]!, firsts[firsts.length - 1]!] : [firsts[0]!];
  return picked.map((c) => c.toLocaleUpperCase()).join('');
}

/**
 * One or two initials for an avatar: first and last word of the display name,
 * else of the username (split on `.`, `_` and `-`); `?` if neither has a letter.
 * `max: 1` keeps only the first (for small avatars).
 */
export function initialsFor(
  displayName: string | null | undefined,
  username: string,
  max: 1 | 2 = 2,
): string {
  return (
    initialsOf((displayName ?? '').trim().split(/\s+/), max) ||
    initialsOf(username.split(/[\s._-]+/), max) ||
    '?'
  );
}
