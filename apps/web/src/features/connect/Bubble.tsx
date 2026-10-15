import {
  ArrowBendUpLeftIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  CopyIcon,
  ShieldSlashIcon,
  SmileyIcon,
  TimerIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { formatClock, messageSummary, tokenizeText, type Receipt } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { memo, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { FileAttachment, ImageAttachment, VideoAttachment, VoiceAttachment } from './Attachment';
import type { ResolvedChatTheme } from './ui';

export type { Receipt } from '@vybora/core';
/** Reactions are message content (shown as emoji), not interface icons. */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

export function Ticks({ receipt }: { receipt: Receipt }) {
  if (receipt === 'sending') return <ClockIcon size={12} aria-label="Sending" />;
  if (receipt === 'failed')
    return <WarningCircleIcon size={12} className="text-danger" aria-label="Not sent" />;
  if (receipt === 'sent') return <CheckIcon size={13} aria-label="Sent" />;
  return (
    <ChecksIcon
      size={13}
      weight={receipt === 'read' ? 'bold' : 'regular'}
      aria-label={receipt === 'read' ? 'Read' : 'Delivered'}
    />
  );
}

/** Text with safe, clickable links (never rendered as HTML). */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {tokenizeText(text).map((t, i) =>
        t.type === 'url' ? (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {t.value}
          </a>
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </>
  );
}

const RECEIPT_LABEL: Record<Receipt, string> = {
  sending: 'sending',
  failed: 'not sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
};

/** Flat notch on the last bubble of a run, in the bubble's own colour. */
function Tail({ mine, fill }: { mine: boolean; fill?: string }) {
  return (
    <svg
      width="8"
      height="10"
      viewBox="0 0 8 10"
      aria-hidden="true"
      data-tail="true"
      className={cn('absolute bottom-0', mine ? '-right-[7px]' : '-left-[7px] -scale-x-100')}
    >
      <path d="M0 0C0.5 6 3.5 9 8 10H0Z" fill={fill ?? 'var(--vy-bubble-in)'} />
      {!fill && (
        <path d="M0 0C0.5 6 3.5 9 8 10H0" fill="none" stroke="var(--vy-border)" strokeWidth="1" />
      )}
    </svg>
  );
}

function ActionButton({
  label,
  onClick,
  children,
  danger,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors duration-150',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export interface BubbleProps {
  message: LocalMessage;
  mine: boolean;
  theme: ResolvedChatTheme;
  senderName?: string;
  showSender: boolean;
  receipt?: Receipt;
  myUserId: string;
  nameOf: (userId: string) => string;
  onReact: (m: LocalMessage, emoji: string) => void;
  onReply: (m: LocalMessage) => void;
  onDelete: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  onOpenImage: (url: string) => void;
  onJumpTo?: (id: string) => void;
  runStart: boolean;
  runEnd: boolean;
  /** Group chats, incoming only: shown beside the last bubble of a run. */
  avatar?: { path: string | null; name: string };
  /** The newest message is the thread's single Tab stop. */
  tabbable?: boolean;
  onSelect: (m: LocalMessage) => void;
}

export const Bubble = memo(function Bubble({
  message: m,
  mine,
  theme,
  senderName,
  showSender,
  receipt,
  myUserId,
  nameOf,
  onReact,
  onReply,
  onDelete,
  onRetry,
  onOpenImage,
  onJumpTo,
  runStart,
  runEnd,
  avatar,
  tabbable,
}: BubbleProps) {
  const [picker, setPicker] = useState(false);
  const senderLabel = mine ? 'You' : nameOf(m.senderId);
  const label = [
    senderLabel,
    formatClock(m.createdAt),
    messageSummary(m),
    receipt ? RECEIPT_LABEL[receipt] : null,
  ]
    .filter(Boolean)
    .join(', ');
  const filled = mine && !m.deleted && m.kind !== 'undecryptable';
  const actionable =
    !m.deleted && m.kind !== 'undecryptable' && m.status !== 'sending' && m.status !== 'failed';
  const media =
    m.kind === 'attachment' &&
    (m.attachment?.kind === 'image' || m.attachment?.kind === 'video') &&
    !m.deleted;
  const metaColor = filled ? 'text-white/75' : 'text-subtle';

  let content: ReactNode;
  if (m.kind === 'undecryptable') {
    content = (
      <span className="flex items-center gap-2 text-sm italic text-muted">
        <ShieldSlashIcon size={14} className="shrink-0 text-warning" aria-hidden="true" />
        This message couldn’t be decrypted on this device.
      </span>
    );
  } else if (m.deleted) {
    content = <span className="text-sm italic opacity-75">This message was deleted</span>;
  } else if (m.kind === 'attachment' && m.attachment) {
    const a = m.attachment;
    content = (
      <div className="space-y-1.5">
        {a.kind === 'image' && <ImageAttachment attachment={a} onOpen={onOpenImage} />}
        {a.kind === 'video' && <VideoAttachment attachment={a} />}
        {a.kind === 'voice' && <VoiceAttachment attachment={a} />}
        {a.kind === 'file' && <FileAttachment attachment={a} />}
        {m.caption && (
          <p className={cn('break-anywhere whitespace-pre-wrap text-msg', media && 'px-2 pb-0.5')}>
            <Linkified text={m.caption} />
          </p>
        )}
      </div>
    );
  } else {
    content = (
      <p className="break-anywhere whitespace-pre-wrap text-msg">
        <Linkified text={m.body ?? ''} />
      </p>
    );
  }

  const reactions = Object.entries(m.reactions).filter(([, users]) => users.length);

  return (
    <div
      className={cn(
        'group flex flex-col px-3 md:px-6',
        runStart ? 'pt-2' : 'pt-0.5',
        mine ? 'items-end' : 'items-start',
      )}
      data-message-id={m.id}
      tabIndex={tabbable ? 0 : -1}
      role="article"
      aria-label={label}
    >
      {showSender && !mine && senderName && (
        <span
          className={cn('mb-0.5 text-xs font-semibold', avatar ? 'ml-9' : 'ml-1')}
          style={{ color: theme.accent }}
        >
          {senderName}
        </span>
      )}
      <div className={cn('flex max-w-full items-end gap-2', mine && 'flex-row-reverse')}>
        {avatar &&
          !mine &&
          (runEnd ? (
            <Avatar path={avatar.path} name={avatar.name} size={28} />
          ) : (
            <span className="w-7 shrink-0" aria-hidden="true" />
          ))}
        <div
          className={cn(
            'relative flex max-w-[min(80%,600px)] items-center gap-1',
            mine && 'flex-row-reverse',
          )}
        >
          <div
            className={cn(
              'relative min-w-0 rounded-lg',
              media ? 'p-1' : 'px-3 py-2',
              runEnd && (mine ? 'rounded-br-sm' : 'rounded-bl-sm'),
              !filled && 'border border-line bg-bubble-in text-ink',
            )}
            style={filled ? { background: theme.bubble, color: theme.bubbleText } : undefined}
          >
            {m.replyTo && !m.deleted && (
              <button
                type="button"
                onClick={() => onJumpTo?.(m.replyTo!.id)}
                className={cn(
                  'mb-1.5 block w-full border-l-2 py-0.5 pl-2 text-left',
                  filled ? 'border-white/70' : '',
                  media && 'mx-1 mt-1 w-[calc(100%-8px)]',
                )}
                style={filled ? undefined : { borderColor: theme.accent }}
              >
                <span
                  className="block text-xs font-semibold"
                  style={{ color: filled ? undefined : theme.accent }}
                >
                  {nameOf(m.replyTo.senderId)}
                </span>
                <span className="line-clamp-2 text-[13px] opacity-80">{m.replyTo.preview}</span>
              </button>
            )}
            {content}
            <span
              className={cn(
                'mt-0.5 flex items-center justify-end gap-1 font-mono text-[11px] leading-4',
                metaColor,
                media && 'px-2 pb-1',
              )}
            >
              {m.expiresAt && <TimerIcon size={11} aria-label="Disappearing message" />}
              <time dateTime={m.createdAt}>{formatClock(m.createdAt)}</time>
              {mine && receipt && <Ticks receipt={receipt} />}
            </span>
            {runEnd && <Tail mine={mine} fill={filled ? theme.bubble : undefined} />}
          </div>

          {actionable && (
            <div
              className={cn(
                'flex shrink-0 items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100',
                picker && 'opacity-100',
              )}
            >
              <ActionButton label="React" onClick={() => setPicker((p) => !p)} expanded={picker}>
                <SmileyIcon size={16} />
              </ActionButton>
              <ActionButton label="Reply" onClick={() => onReply(m)}>
                <ArrowBendUpLeftIcon size={16} />
              </ActionButton>
              {m.kind === 'text' && (
                <ActionButton
                  label="Copy text"
                  onClick={() => void navigator.clipboard?.writeText(m.body ?? '')}
                >
                  <CopyIcon size={15} />
                </ActionButton>
              )}
              {mine && (
                <ActionButton label="Delete for everyone" onClick={() => onDelete(m)} danger>
                  <TrashIcon size={15} />
                </ActionButton>
              )}
            </div>
          )}

          {picker && (
            <div
              role="menu"
              aria-label="Reactions"
              className={cn(
                'absolute -top-11 z-10 flex gap-0.5 rounded-md border border-line-strong bg-surface p-1',
                mine ? 'right-0' : 'left-0',
              )}
              onKeyDown={(e) => e.key === 'Escape' && setPicker(false)}
            >
              {QUICK_REACTIONS.map((e) => {
                const on = m.reactions[e]?.includes(myUserId);
                return (
                  <button
                    key={e}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPicker(false);
                      onReact(m, e);
                    }}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-sm text-lg hover:bg-surface-muted',
                      on && 'bg-accent-soft',
                    )}
                    aria-label={`${on ? 'Remove' : 'React with'} ${e}`}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {reactions.length > 0 && (
        <div className={cn('mt-1 flex gap-1', mine ? 'mr-1' : 'ml-1')}>
          {reactions.map(([emoji, users]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(m, emoji)}
              title={users.map(nameOf).join(', ')}
              aria-label={`${emoji} ${users.length}, ${users.includes(myUserId) ? 'remove your reaction' : 'react'}`}
              className={cn(
                'flex h-6 items-center gap-1 rounded-sm border px-1.5 text-xs',
                users.includes(myUserId)
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface',
              )}
            >
              <span>{emoji}</span>
              {users.length > 1 && (
                <span className="font-mono text-[11px] text-muted">{users.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {receipt === 'failed' && (
        <button
          type="button"
          onClick={() => onRetry(m)}
          className="mr-1 mt-0.5 text-xs font-medium text-danger underline-offset-2 hover:underline"
        >
          Not sent · Retry
        </button>
      )}
    </div>
  );
});
