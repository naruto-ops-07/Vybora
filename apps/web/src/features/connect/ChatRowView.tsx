import { AtIcon, BellSlashIcon, LockSimpleIcon, PushPinIcon } from '@phosphor-icons/react';
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
  /** An unread message in this chat mentions me. */
  mentioned?: boolean;
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
  mentioned,
  active,
  alwaysShowActions,
  onPin,
  onArchive,
  wrapLink = (link) => link,
}: ChatRowViewProps) {
  const unread = unreadCount > 0;
  return (
    <li
      // Inset, rounded, the accent wash when current; the group avatar's ring and the
      // online dot's edge follow the row's background (styles/workspace.css `.vy-row`).
      className={cn(
        'vy-row group relative',
        // Always-visible actions sit beside the row so they never cover its time.
        alwaysShowActions && 'flex items-center',
      )}
      data-active={active || undefined}
    >
      {wrapLink(
        <Link
          to={to}
          data-chat-link
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-3 rounded-[inherit] px-3 py-2.5',
            alwaysShowActions && 'min-w-0 flex-1 pr-2',
          )}
        >
          {active && (
            <span
              className="vy-row-mark absolute top-1/2 -left-0.5 h-6 w-[3px] -translate-y-1/2"
              aria-hidden="true"
            />
          )}
          <span className="relative">
            {avatar}
            {online && (
              <span
                className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[var(--avatar-ring)] bg-success"
                aria-label="Online"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'text-msg truncate',
                  unread ? 'font-semibold text-ink' : 'font-medium',
                )}
              >
                {title}
              </span>
              {pinned && (
                <PushPinIcon size={12} className="shrink-0 text-subtle" aria-label="Pinned" />
              )}
              {muted && (
                <BellSlashIcon size={12} className="shrink-0 text-subtle" aria-label="Muted" />
              )}
              <Meta className={cn('ml-auto shrink-0 pl-1', unread && 'font-medium text-accent')}>
                {time}
              </Meta>
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
              {mentioned && (
                <AtIcon
                  size={14}
                  weight="bold"
                  className="ml-auto shrink-0 text-accent"
                  aria-label="You were mentioned"
                  role="img"
                />
              )}
              {unread && (
                <span
                  className={cn(
                    'vy-count flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-none font-semibold tabular-nums',
                    mentioned ? 'ml-1.5' : 'ml-auto',
                  )}
                  data-muted={muted || undefined}
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
