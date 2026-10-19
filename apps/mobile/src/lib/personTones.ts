import { personTonesByLook, type Look } from '@vybora/config';
import { personTone, type ToneName } from '@vybora/core';
import { useTheme } from './theme';

export interface PersonToneStyle {
  name: ToneName;
  /** Avatar fallback fill. */
  fill: string;
  /** Initials on the fill. */
  ink: string;
  /** The person's name on surfaces and bubbles. */
  text: string;
  /** High contrast: names use the theme text colour, bold, instead of the tone. */
  bold: boolean;
}

/**
 * A person's tone for the current look and theme. Tones are identity, never status: avatar
 * fallbacks, group sender names and mentions only. Mirrors web `--vy-tone-*`.
 */
export function usePersonTone(userId: string): PersonToneStyle {
  const t = useTheme();
  return personToneStyle(userId, t.dark, t.highContrast, t.text, t.look);
}

export function personToneStyle(
  userId: string,
  dark: boolean,
  highContrast: boolean,
  themeText: string,
  look: Look,
): PersonToneStyle {
  const name = personTone(userId);
  const c = personTonesByLook[look][name][dark ? 'dark' : 'light'];
  return highContrast
    ? {
        name,
        fill: c.fill,
        ink: c.hcInk,
        text: themeText,
        bold: true,
      }
    : { name, fill: c.fill, ink: c.ink, text: c.name, bold: false };
}
