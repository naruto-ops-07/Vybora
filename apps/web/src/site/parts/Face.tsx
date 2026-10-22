import { initialsFor, personTone } from '@vybora/core';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export interface SamplePerson {
  id: string;
  username: string;
  name: string;
}

// Sample people for the illustrations (ids picked so each lands on a different tone).
export const MAYA: SamplePerson = { id: 'landing-6', username: 'maya', name: 'Maya Chen' };
export const THEO: SamplePerson = { id: 'landing-1', username: 'theo', name: 'Theo Park' };
export const INES: SamplePerson = { id: 'landing-5', username: 'ines', name: 'Ines Duarte' };
export const KOFI: SamplePerson = { id: 'landing-0', username: 'kofi', name: 'Kofi Mensah' };

export const toneOf = (p: SamplePerson) => {
  const t = personTone(p.id);
  return {
    fill: `var(--vy-tone-${t}-fill)`,
    ink: `var(--vy-tone-${t}-ink)`,
    text: `var(--vy-tone-${t}-name)`,
  };
};

/**
 * A sample person's avatar: a circle in their tone with their initials, as the app draws
 * it without a photo. A light copy of the app's Avatar that needs no storage client, so
 * the public pages stay small.
 */
export function Face({
  person,
  size = 40,
  className,
}: {
  person: SamplePerson;
  size?: number;
  className?: string;
}) {
  const tone = toneOf(person);
  const style: CSSProperties = {
    width: size,
    height: size,
    background: tone.fill,
    color: tone.ink,
    fontSize: Math.round(size * (size < 30 ? 0.42 : 0.38)),
  };
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'type-wide inline-flex shrink-0 items-center justify-center rounded-full leading-none',
        className,
      )}
    >
      {initialsFor(person.name, person.username, size < 30 ? 1 : 2)}
    </span>
  );
}
