import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { friendlyError } from '@vybora/core';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line text-accent">
          {icon}
        </div>
      )}
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
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
