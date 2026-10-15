import { ArrowDownIcon } from '@phosphor-icons/react';
import { formatUnread } from '@vybora/core';

/** Day separator; sticks to the top of the thread while its day is on screen. */
export function DateChip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none sticky top-2 z-10 my-3 flex justify-center">
      <h2 className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
        {label}
      </h2>
    </div>
  );
}

export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className="my-3 flex items-center gap-3 px-3 md:px-6" data-unread-divider>
      <span className="h-px flex-1 bg-accent" aria-hidden="true" />
      <h2 className="font-mono text-[11px] font-medium text-accent">
        {count === 1 ? '1 unread message' : `${count} unread messages`}
      </h2>
      <span className="h-px flex-1 bg-accent" aria-hidden="true" />
    </div>
  );
}

export function JumpToLatest({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      className="touch-target absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-surface text-ink transition-colors duration-150 hover:bg-surface-muted md:right-6"
    >
      <ArrowDownIcon size={18} aria-hidden="true" />
      {count > 0 && (
        <span
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-sm bg-accent px-1 font-mono text-[11px] font-medium text-on-accent"
          aria-hidden="true"
        >
          {formatUnread(count)}
        </span>
      )}
    </button>
  );
}
