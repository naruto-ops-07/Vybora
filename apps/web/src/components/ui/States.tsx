import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { friendlyError } from '@vybora/core';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />;
}

/**
 * One empty state for the product: an illustration (or a small icon tile),
 * a heading in the brand's wide voice, one sentence, then a primary and an
 * optional secondary action. Anything extra (e.g. the HandleCard) goes below.
 */
export function EmptyState({
  illustration,
  icon,
  title,
  body,
  action,
  secondaryAction,
  children,
  headingLevel = 3,
  className,
}: {
  /** Decorative art from `@/components/illustrations` (already `aria-hidden`). */
  illustration?: ReactNode;
  /** Small icon tile, for places too tight for an illustration. */
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  children?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {illustration ? (
        <div className="mb-5">{illustration}</div>
      ) : (
        icon && (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line text-accent">
            {icon}
          </div>
        )
      )}
      <Heading className="type-wide text-[17px] font-semibold text-balance">{title}</Heading>
      {body && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{body}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
      {children && <div className="mt-6 w-full max-w-sm text-left">{children}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {friendlyError(error, 'We couldn’t load this right now.')}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
          leftIcon={<ArrowClockwiseIcon size={14} />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
