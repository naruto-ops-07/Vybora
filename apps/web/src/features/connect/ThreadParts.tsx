import { ArrowDownIcon } from '@phosphor-icons/react';
import { formatUnread, type ThreadItem, type ThreadMessageLike } from '@vybora/core';
import type { ReactNode } from 'react';

/** Day separator; sticks to the top of the thread while its day is on screen. */
export function DateChip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none sticky top-2 z-10 my-3 flex justify-center">
      <h2 className="vy-float rounded-full px-2.5 py-0.5 font-mono text-[11px] leading-4 font-medium">
        {label}
      </h2>
    </div>
  );
}

/**
 * One day of the thread: bounds the sticky date chip. A plain container, not a
 * labelled section — the chip's heading already names the day, and a landmark per
 * day would flood the landmark list.
 */
export function ThreadDay({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className="my-3 flex items-center gap-3 px-3 md:px-6" data-unread-divider>
      <span className="h-px flex-1 bg-accent/50" aria-hidden="true" />
      <h2 className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] leading-4 font-medium text-accent">
        {count === 1 ? '1 unread message' : `${count} unread messages`}
      </h2>
      <span className="h-px flex-1 bg-accent/50" aria-hidden="true" />
    </div>
  );
}

export function JumpToLatest({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      className="vy-float touch-target absolute right-4 bottom-4 z-10 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:text-accent md:right-6"
    >
      <ArrowDownIcon size={18} aria-hidden="true" />
      {count > 0 && (
        <span
          className="vy-count absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-none font-semibold"
          aria-hidden="true"
        >
          {formatUnread(count)}
        </span>
      )}
    </button>
  );
}

export interface DayGroup<M extends ThreadMessageLike> {
  key: string;
  label: string;
  items: ThreadItem<M>[];
}

/** Split thread items into per-day sections so each sticky chip is bounded by its own day. */
export function groupByDay<M extends ThreadMessageLike>(items: ThreadItem<M>[]): DayGroup<M>[] {
  const groups: DayGroup<M>[] = [];
  for (const it of items) {
    if (it.type === 'date') groups.push({ key: it.key, label: it.label, items: [it] });
    else groups.at(-1)?.items.push(it);
  }
  return groups;
}
