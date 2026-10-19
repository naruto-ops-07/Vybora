import { ArrowLeftIcon, InfoIcon, LockSimpleIcon, TimerIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { TypingDots } from './ui';

/**
 * The chat's header, on the look's panel (frosted in Aurora and Bloom, over the canvas
 * glow): back (phones), the person or group with their name in the look's display face
 * and a live status line, the disappearing timer, and Details. No data of its own.
 */
export function ChatHeaderView({
  title,
  avatar,
  subtitle,
  typing,
  online,
  accent,
  disappearing,
  details,
  onToggleDetails,
}: {
  title: string;
  /** 40 px Avatar or GroupAvatar. */
  avatar: ReactNode;
  subtitle: string;
  typing: boolean;
  online: boolean;
  /** The chat theme's accent (typing). */
  accent: string;
  /** Disappearing timer label, e.g. "1h". */
  disappearing?: string | null;
  details: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <header className="vy-panel vy-canvas-layer flex h-16 shrink-0 items-center gap-2 border-b px-2 md:px-4">
      <Link
        to="/messages"
        className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--vy-text)_7%,transparent)] hover:text-ink md:hidden"
        aria-label="Back to chats"
      >
        <ArrowLeftIcon size={20} />
      </Link>
      <button
        type="button"
        onClick={onToggleDetails}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pr-2 text-left"
        aria-label={`${title}, chat details`}
      >
        {avatar}
        <span className="min-w-0">
          <span className="type-wide block truncate text-[17px] leading-6 font-semibold">
            {title || ' '}
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[11px] leading-4"
            aria-live="polite"
          >
            {typing ? (
              <TypingDots color={accent} />
            ) : online ? (
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            ) : (
              <LockSimpleIcon size={10} className="text-subtle" aria-hidden="true" />
            )}
            <span
              className={online && !typing ? 'text-success' : 'text-subtle'}
              style={typing ? { color: accent } : undefined}
            >
              {subtitle}
            </span>
          </span>
        </span>
      </button>
      {disappearing ? (
        <span
          className="flex items-center gap-1 rounded-full border border-line bg-surface/60 px-2 py-0.5 font-mono text-[11px] text-muted"
          title="Disappearing messages are on"
        >
          <TimerIcon size={12} aria-hidden="true" /> {disappearing}
          <span className="sr-only">disappearing messages</span>
        </span>
      ) : null}
      <Tip label="Details" shortcut="Alt I">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleDetails}
          aria-label="Chat details"
          aria-pressed={details}
          className={cn('text-muted', details && 'bg-accent-soft text-ink')}
        >
          <InfoIcon size={20} weight={details ? 'fill' : 'regular'} />
        </Button>
      </Tip>
    </header>
  );
}
