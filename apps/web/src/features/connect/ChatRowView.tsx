import { BellSlashIcon, LockSimpleIcon, PushPinIcon } from '@phosphor-icons/react';
import { formatUnread, type RowPreview } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { ChatRowActions, RowPreviewText } from './ChatRowParts';
import { Meta } from './ui';

export interface ChatRowViewProps {
  to: string;
  title: string;
  /** A person's `Avatar` or a `GroupAvatar` at 48 px. */
  avatar: ReactNode;
  online?: boolean;
  /** Already formatted row time. */
  time: string;
  /** `null` while the device is locked: the row says "Encrypted" instead. */
  preview: RowPreview | null;
  unreadCount: number;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  active: boolean;
  alwaysShowActions: boolean;
  onPin: () => void;
  onArchive: () => void;
  /** Wraps the row link, e.g. in the right-click menu. */
  wrapLink?: (link: ReactElement) => ReactElement;
}

/**
 * One chat in the list — every pixel of the row, no data fetching. InboxPane
 * feeds it live data; the dev gallery feeds it sample data.
 */
export function ChatRowView({
  to,
  title,
  avatar,
  online,
  time,
  preview,
  unreadCount,
  pinned,
  archived,
  muted,
  active,
  alwaysShowActions,
  onPin,
  onArchive,
  wrapLink = (link) => link,
}: ChatRowViewProps) {
  const unread = unreadCount > 0;
  return (
    <li
      className={cn(
        'group relative transition-colors duration-150',
        // The group avatar's ring matches whatever background the row has.
        active
          ? 'bg-surface-strong [--avatar-ring:var(--vy-surface-strong)]'
          : 'hover:bg-surface-muted hover:[--avatar-ring:var(--vy-surface-muted)]',
        // Always-visible actions sit beside the row so they never cover its time.
        alwaysShowActions && 'flex items-center',
      )}
    >
      {wrapLink(
        <Link
          to={to}
          data-chat-link
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-3 px-4 py-2.5',
            alwaysShowActions && 'min-w-0 flex-1 pr-2',
          )}
        >
          {active && (
            <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden="true" />
          )}
          <span className="relative">
            {avatar}
            {online && (
              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success"
                aria-label="Online"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cn('truncate text-msg', unread ? 'font-semibold' : 'font-medium')}>
                {title}
              </span>
              {pinned && (
                <PushPinIcon size={12} className="shrink-0 text-subtle" aria-label="Pinned" />
              )}
              {muted && (
                <BellSlashIcon size={12} className="shrink-0 text-subtle" aria-label="Muted" />
              )}
              <Meta className={cn('ml-auto shrink-0', unread && 'text-accent')}>{time}</Meta>
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span
                className={cn('text-msg-sm min-w-0 truncate', unread ? 'text-ink' : 'text-muted')}
              >
                {preview ? (
                  <RowPreviewText preview={preview} unread={unread} />
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <LockSimpleIcon size={11} aria-hidden="true" /> Encrypted
                  </span>
                )}
              </span>
              {unread && (
                <span
                  className={cn(
                    'ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[11px] font-medium',
                    muted ? 'bg-surface-strong text-ink' : 'bg-accent text-on-accent',
                  )}
                >
                  {formatUnread(unreadCount)}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </span>
          </span>
        </Link>,
      )}
      <ChatRowActions
        title={title}
        pinned={pinned}
        archived={archived}
        alwaysShow={alwaysShowActions}
        onPin={onPin}
        onArchive={onArchive}
      />
    </li>
  );
}
