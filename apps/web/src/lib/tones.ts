import { personTone, type ToneName } from '@vybora/core';

export interface ToneVars {
  name: ToneName;
  /** Avatar fallback fill. */
  fill: string;
  /** Initials on the fill. */
  ink: string;
  /** Text colour for the person's name on surfaces and bubbles. */
  text: string;
}

/** CSS variables for a person's tone; they switch with light/dark/high contrast (index.css). */
export function toneVars(userId: string): ToneVars {
  const name = personTone(userId);
  return {
    name,
    fill: `var(--vy-tone-${name}-fill)`,
    ink: `var(--vy-tone-${name}-ink)`,
    text: `var(--vy-tone-${name}-name)`,
  };
}
