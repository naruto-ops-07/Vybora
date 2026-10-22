import { CheckIcon, CopyIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { friendInviteLink } from '@vybora/core';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOnboarding } from '@/features/onboarding/store';
import { cn } from '@/lib/cn';
import { siteUrl } from '@/lib/env';

export interface HandlePerson {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

export type HandleShareDone = 'username' | 'link' | null;
const FEEDBACK_MS = 2000;

/**
 * Copy and Share for an @username: Copy puts "@username" on the clipboard; Share opens
 * the system share sheet with a link that prefills the add-friend field, or copies that
 * link where there's no share sheet. `done` says what just went through, for 2 s.
 */
export function useHandleShare({
  username,
  link,
  onShared,
}: {
  username: string;
  link: string;
  /** Called once a copy or share has gone through. */
  onShared?: () => void;
}) {
  const toast = useToast();
  const [done, setDone] = useState<HandleShareDone>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const handle = `@${username}`;

  const flash = (what: Exclude<HandleShareDone, null>) => {
    setDone(what);
    onShared?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), FEEDBACK_MS);
  };

  const copy = async (text: string, what: Exclude<HandleShareDone, null>) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      toast.show(`Couldn’t copy. Your username is ${handle}.`, 'error');
    }
  };

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'VYBORA', text: `Add me on VYBORA: ${handle}`, url: link });
        onShared?.();
        return;
      } catch (e) {
        // Closing the share sheet is not a failure, and not a share.
        if ((e as { name?: string } | null)?.name === 'AbortError') return;
      }
    }
    await copy(link, 'link');
  };

  /** What a polite live region should say about `done`. */
  const status =
    done === 'username' ? `${handle} copied` : done === 'link' ? 'Link to add you copied' : '';

  return {
    handle,
    done,
    status,
    copyHandle: () => copy(handle, 'username'),
    share,
  };
}

/** Share for the signed-in user (counts as "Share your username"); null until the profile loads. */
export function useShareMyHandle() {
  const { profile } = useAuth();
  const [, update] = useOnboarding(profile?.id);
  const username = profile?.username ?? '';
  const share = useHandleShare({
    username,
    link: friendInviteLink(siteUrl(), username),
    onShared: () => update({ shared: true }),
  });
  return username ? share : null;
}

/**
 * Your own @username, ready to pass on. Copy puts "@username" on the
 * clipboard; Share opens the system share sheet with a link that prefills the
 * add-friend field (`/friends?add=…`), or copies that link where there's no
 * share sheet. Both count as "Share your username" in Get started.
 */
export function HandleCardView({
  person,
  link,
  variant = 'full',
  onShared,
  className,
}: {
  person: HandlePerson;
  link: string;
  variant?: 'full' | 'compact';
  /** Called once a copy or share has gone through. */
  onShared?: () => void;
  className?: string;
}) {
  const {
    handle,
    done,
    status: said,
    copyHandle,
    share,
  } = useHandleShare({
    username: person.username,
    link,
    onShared,
  });
  const name = person.display_name || person.username;

  const compact = variant === 'compact';
  const buttons = (
    <div className={cn('flex shrink-0 gap-2', !compact && 'mt-3')}>
      <Button
        size="sm"
        variant="outline"
        className="touch-target"
        aria-label={done === 'username' ? 'Copied' : `Copy ${handle}`}
        leftIcon={
          done === 'username' ? (
            <CheckIcon size={14} weight="bold" aria-hidden="true" />
          ) : (
            <CopyIcon size={14} aria-hidden="true" />
          )
        }
        onClick={() => void copyHandle()}
      >
        {done === 'username' ? 'Copied' : 'Copy'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="touch-target"
        aria-label={done === 'link' ? undefined : 'Share a link to add you'}
        leftIcon={
          done === 'link' ? (
            <CheckIcon size={14} weight="bold" aria-hidden="true" />
          ) : (
            <ShareNetworkIcon size={14} aria-hidden="true" />
          )
        }
        onClick={() => void share()}
      >
        {done === 'link' ? 'Link copied' : 'Share'}
      </Button>
    </div>
  );
  const status = (
    <span aria-live="polite" className="sr-only" data-handle-status="">
      {said}
    </span>
  );

  if (compact)
    return (
      <div
        className={cn('flex flex-wrap items-center gap-2', className)}
        data-handle-card="compact"
      >
        <span className="flex h-8 min-w-0 flex-1 basis-28 items-center rounded-sm border border-line bg-surface-muted px-2.5">
          <span className="truncate font-mono text-[13px] text-ink">{handle}</span>
        </span>
        {buttons}
        {status}
      </div>
    );

  return (
    <div
      className={cn('vy-card rounded-lg border-t-[var(--vy-edge)] p-4', className)}
      data-handle-card="full"
    >
      <div className="flex items-center gap-3">
        <Avatar
          path={person.avatar_path}
          name={name}
          userId={person.id}
          displayName={person.display_name}
          username={person.username}
          size={44}
          decorative
        />
        <span className="min-w-0 flex-1">
          <span className="type-wide block truncate text-[16px] leading-6">{name}</span>
          <span className="block truncate font-mono text-[13px] text-muted">{handle}</span>
        </span>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted">
        Friends add you by this exact username.
      </p>
      {buttons}
      {status}
    </div>
  );
}

/** HandleCard for the signed-in user. Renders nothing until the profile has loaded. */
export function HandleCard({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const { profile } = useAuth();
  const [, update] = useOnboarding(profile?.id);
  if (!profile?.username) return null;
  return (
    <HandleCardView
      person={profile}
      link={friendInviteLink(siteUrl(), profile.username)}
      variant={variant}
      onShared={() => update({ shared: true })}
      className={className}
    />
  );
}
