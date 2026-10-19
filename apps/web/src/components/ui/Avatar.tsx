import { UsersThreeIcon } from '@phosphor-icons/react';
import { avatarUrl } from '@vybora/api';
import { initialsFor } from '@vybora/core';
import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { toneVars } from '@/lib/tones';

export interface AvatarProps {
  path: string | null | undefined;
  /** Accessible name (usually the username or the name shown beside it). */
  name: string;
  /** Picks the person's tone for the fallback; stable across devices. */
  userId: string;
  /** Initials come from the display name, else `username`, else `name`. */
  displayName?: string | null;
  username?: string;
  size?: number;
  className?: string;
  /** Part of a larger labelled image (e.g. a group avatar): no role or name of its own. */
  decorative?: boolean;
}

/** Below this size two letters get too small to read; show one. */
const TWO_INITIALS_MIN = 24;

/**
 * A person's photo, or a circle in their tone with one or two initials (the look's
 * display face, semibold, sized to the circle), with a hairline inner edge so pale tones
 * and photos hold their shape on any surface. Avatars are content, so circles are allowed.
 */
export function Avatar({
  path,
  name,
  userId,
  displayName,
  username,
  size = 40,
  className,
  decorative,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? avatarUrl(supabase, path) : null;
  const initials = initialsFor(displayName, username ?? name, size < TWO_INITIALS_MIN ? 1 : 2);
  const two = initials !== initialsFor(displayName, username ?? name, 1);
  const tone = toneVars(userId);
  return (
    <span
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
      data-tone={src ? undefined : tone.name}
    >
      <span
        className="vy-avatar-face flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={!src ? { background: tone.fill } : undefined}
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            width={size}
            height={size}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="select-none font-display font-semibold leading-none"
            style={{
              color: tone.ink,
              fontSize: Math.max(8, Math.round(size * (two ? 0.36 : 0.42))),
              letterSpacing: two ? '0.02em' : undefined,
            }}
            aria-hidden="true"
          >
            {initials}
          </span>
        )}
      </span>
    </span>
  );
}

export interface AvatarPerson {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

/** The two members a group avatar shows: first two by id, so every device agrees. */
export function groupAvatarPair(members: readonly AvatarPerson[]): AvatarPerson[] {
  return [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 2);
}

/**
 * Two overlapping member avatars: the back one up-left, the front one down-right
 * with a 2 px ring in the surface colour (a border, not a shadow). The ring follows
 * `--avatar-ring` so rows can match their hover/selected background.
 * Pass the *other* members; one shows alone, none falls back to a group glyph.
 */
export function GroupAvatar({
  members,
  size = 44,
  label = 'Group',
  className,
}: {
  members: readonly AvatarPerson[];
  size?: number;
  label?: string;
  className?: string;
}) {
  const [back, front] = groupAvatarPair(members);
  const box: CSSProperties = { width: size, height: size };
  if (!back)
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-strong text-muted',
          className,
        )}
        style={box}
        role="img"
        aria-label={label}
      >
        <UsersThreeIcon size={Math.round(size * 0.48)} aria-hidden="true" />
      </span>
    );
  if (!front)
    return (
      <span
        className={cn('inline-block shrink-0', className)}
        style={box}
        role="img"
        aria-label={label}
      >
        <Avatar {...person(back)} size={size} decorative />
      </span>
    );
  const inner = Math.round(size * 0.62);
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={box}
      role="img"
      aria-label={label}
      data-group-avatar=""
    >
      <Avatar {...person(back)} size={inner} decorative className="absolute left-0 top-0" />
      <span
        className="absolute bottom-0 right-0 rounded-full border-2"
        style={{ borderColor: 'var(--avatar-ring, var(--vy-surface))' }}
        data-avatar-front=""
      >
        <Avatar {...person(front)} size={inner} decorative className="block" />
      </span>
    </span>
  );
}

const person = (p: AvatarPerson) => ({
  path: p.avatar_path,
  name: p.username,
  userId: p.id,
  displayName: p.display_name,
  username: p.username,
});
