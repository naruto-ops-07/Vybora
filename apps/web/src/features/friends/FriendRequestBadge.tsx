import { formatUnread, friendRequestsLabel } from '@vybora/core';
import { cn } from '@/lib/cn';

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
          'vy-count flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold tabular-nums',
          className,
        )}
      >
        {formatUnread(count)}
      </span>
      <span className="sr-only">, {friendRequestsLabel(count)}</span>
    </>
  );
}
