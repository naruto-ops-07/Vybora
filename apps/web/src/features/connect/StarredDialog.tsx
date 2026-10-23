import { StarIcon } from '@phosphor-icons/react';
import { formatRowTime, messageSummary } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Skeleton } from '@/components/ui/States';

export interface StarredRowInfo {
  /** The chat's name (shown when listing every chat). */
  chat: string;
  sender: string;
  nameOf: (userId: string) => string;
  /** So my own view-once copy reads "View once photo", never "Opened". */
  myUserId?: string;
}

/**
 * Starred messages on this device (stars are never synced), most recently
 * starred first: for one chat, or for every chat. Picking one opens it in its chat.
 */
export function StarredDialog({
  open,
  onClose,
  scope,
  loading,
  messages,
  describe,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  scope: 'chat' | 'all';
  loading: boolean;
  messages: readonly LocalMessage[];
  describe: (m: LocalMessage) => StarredRowInfo;
  onOpen: (m: LocalMessage) => void;
}) {
  const now = new Date();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Starred messages"
      description={
        scope === 'all' ? 'In every chat, on this browser' : 'In this chat, on this browser'
      }
    >
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading starred messages">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<StarIcon size={22} className="text-accent" aria-hidden="true" />}
          title="No starred messages"
          body="Star a message from its menu to find it here."
        />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {messages.map((m) => {
            const d = describe(m);
            return (
              <li key={`${m.conversationId}/${m.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="vy-row flex w-full flex-col items-stretch gap-0.5 px-2 py-2.5 text-left"
                >
                  <span className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {scope === 'all' && d.chat ? `${d.sender} in ${d.chat}` : d.sender}
                    </span>
                    <time
                      className="shrink-0 font-mono text-[11px] text-subtle"
                      dateTime={m.createdAt}
                    >
                      {formatRowTime(m.createdAt, now)}
                    </time>
                  </span>
                  <span className="text-msg-sm line-clamp-2 break-anywhere text-muted">
                    {messageSummary(m, { nameOf: d.nameOf, myUserId: d.myUserId })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
