import { formatUnread } from '@vybora/core';
import { cn } from '@/lib/cn';
import { friendRequestsLabel } from './copy';

/**
 * Incoming friend request count on the Friends nav entry. The digits are
 * decorative; screen readers hear the full sentence as part of the link name.
 */
export function FriendRequestBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-accent px-1 font-mono text-[10px] font-medium leading-none text-on-accent tabular-nums',
          className,
        )}
      >
        {formatUnread(count)}
      </span>
      <span className="sr-only">, {friendRequestsLabel(count)}</span>
    </>
  );
}
