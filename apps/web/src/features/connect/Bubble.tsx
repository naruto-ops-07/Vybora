import {
  ArrowBendUpLeftIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  CopyIcon,
  DotsThreeIcon,
  ShieldSlashIcon,
  SmileyIcon,
  TimerIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import {
  formatClock,
  messageActions,
  messageSummary,
  SWIPE_REPLY_THRESHOLD,
  tokenizeText,
  type MessageAction,
  type Receipt,
} from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';
import { toneVars } from '@/lib/tones';
import { FileAttachment, ImageAttachment, VideoAttachment, VoiceAttachment } from './Attachment';
import { MessageMenu } from './MessageMenu';
import { QUICK_REACTIONS } from './reactions';
import type { ResolvedChatTheme } from './ui';
import { useSwipeReply } from './useSwipeReply';

export type { Receipt } from '@vybora/core';
export { QUICK_REACTIONS };

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
        'touch-target flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors duration-150',
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
  /** Copy the text with feedback; without it the copy is silent (errors ignored). */
  onCopy?: (m: LocalMessage) => void;
  onReply: (m: LocalMessage) => void;
  onDelete: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  onOpenImage: (url: string) => void;
  onJumpTo?: (id: string) => void;
  runStart: boolean;
  runEnd: boolean;
  /** Group chats, incoming only: shown beside the last bubble of a run. */
  avatar?: { path: string | null; name: string; displayName?: string | null };
  /** The newest message is the thread's single Tab stop. */
  tabbable?: boolean;
  onSelect: (m: LocalMessage) => void;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (m: LocalMessage) => void;
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
  onCopy,
  onReply,
  onDelete,
  onRetry,
  onOpenImage,
  onJumpTo,
  runStart,
  runEnd,
  avatar,
  tabbable,
  onSelect,
  selecting,
  selected,
  onToggleSelect,
}: BubbleProps) {
  const [picker, setPicker] = useState(false);
  const { prefs, reduceMotion } = useA11y();
  const root = useRef<HTMLDivElement>(null);
  const actions = messageActions(m, mine);
  const swipe = useSwipeReply(
    () => onReply(m),
    !selecting && prefs.swipeToReply && actions.includes('reply'),
  );
  const myReactions = Object.entries(m.reactions)
    .filter(([, users]) => users.includes(myUserId))
    .map(([e]) => e);
  const openMenu = () => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 24,
        clientY: r.top + 12,
      }),
    );
  };
  const copy = () => {
    if (onCopy) onCopy(m);
    else void navigator.clipboard?.writeText(m.body ?? '').catch(() => undefined);
  };
  const onAction = (a: MessageAction) => {
    if (a === 'reply') onReply(m);
    else if (a === 'copy') copy();
    else if (a === 'select') onSelect(m);
    else if (a === 'delete') onDelete(m);
  };
  const senderLabel = mine ? 'You' : nameOf(m.senderId);
  const senderTone = toneVars(m.senderId);
  const time = useMemo(() => formatClock(m.createdAt), [m.createdAt]);
  const label = useMemo(
    () =>
      [senderLabel, time, messageSummary(m), receipt ? RECEIPT_LABEL[receipt] : null]
        .filter(Boolean)
        .join(', '),
    [senderLabel, time, m, receipt],
  );
  const filled = mine && !m.deleted && m.kind !== 'undecryptable';
  const media =
    m.kind === 'attachment' &&
    (m.attachment?.kind === 'image' || m.attachment?.kind === 'video') &&
    !m.deleted;
  // High contrast: meta text keeps the bubble's own (on-accent) colour at full strength.
  const metaColor = filled ? (theme.highContrast ? '' : 'text-white/75') : 'text-subtle';

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
        {a.kind === 'image' && (
          <ImageAttachment attachment={a} onOpen={selecting ? () => undefined : onOpenImage} />
        )}
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
    <MessageMenu
      actions={selecting ? [] : actions}
      myReactions={myReactions}
      onReact={(e) => onReact(m, e)}
      onAction={onAction}
    >
      <div
        ref={root}
        {...swipe.handlers}
        style={{ touchAction: 'pan-y' }}
        className={cn(
          'group flex flex-col px-3 md:px-6',
          selecting && selected && 'bg-accent-soft',
          runStart ? 'pt-2' : 'pt-0.5',
          mine ? 'items-end' : 'items-start',
        )}
        data-message-id={m.id}
        tabIndex={tabbable ? 0 : -1}
        role="article"
        aria-label={label}
        data-selected={selecting ? !!selected : undefined}
        onClick={selecting ? () => onToggleSelect?.(m) : undefined}
      >
        {showSender && !mine && senderName && (
          // People are the colour: the sender's tone (high contrast: text colour, bold).
          <span
            className={cn(
              'mb-0.5 text-xs',
              theme.highContrast ? 'font-bold text-ink' : 'font-semibold',
              avatar ? 'ml-9' : 'ml-1',
            )}
            style={theme.highContrast ? undefined : { color: senderTone.text }}
            data-sender-tone={theme.highContrast ? undefined : senderTone.name}
          >
            {senderName}
          </span>
        )}
        <div
          className={cn('relative flex max-w-full items-end gap-2', mine && 'flex-row-reverse')}
          style={{
            transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
            transition: swipe.offset || reduceMotion ? 'none' : 'transform 180ms ease-out',
          }}
        >
          {swipe.offset > 0 && (
            <span
              className="absolute -left-8 top-1/2 -translate-y-1/2 text-muted"
              style={{ opacity: Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD) }}
              aria-hidden="true"
            >
              <ArrowBendUpLeftIcon size={18} />
            </span>
          )}
          {selecting && (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!selected}
              aria-label={`Select message from ${senderLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(m);
              }}
              className={cn(
                'touch-target flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-sm border',
                selected
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong bg-surface',
              )}
            >
              {selected && <CheckIcon size={14} aria-hidden="true" />}
            </button>
          )}
          {avatar &&
            !mine &&
            (runEnd ? (
              <Avatar
                path={avatar.path}
                name={avatar.name}
                userId={m.senderId}
                displayName={avatar.displayName}
                size={28}
              />
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
                selecting && 'pointer-events-none',
              )}
              style={filled ? { background: theme.bubble, color: theme.bubbleText } : undefined}
            >
              {m.replyTo && !m.deleted && (
                <button
                  type="button"
                  onClick={() => !selecting && onJumpTo?.(m.replyTo!.id)}
                  className={cn(
                    'mb-1.5 block w-full border-l-2 py-0.5 pl-2 text-left',
                    filled ? (theme.highContrast ? 'border-current' : 'border-white/70') : '',
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
                <time dateTime={m.createdAt}>{time}</time>
                {mine && receipt && <Ticks receipt={receipt} />}
              </span>
              {runEnd && <Tail mine={mine} fill={filled ? theme.bubble : undefined} />}
            </div>

            {!selecting && actions.length > 0 && (
              <div
                className={cn(
                  'flex shrink-0 items-center transition-opacity duration-150',
                  prefs.alwaysShowActions
                    ? 'opacity-100'
                    : cn(
                        'hover-actions focus-within:opacity-100 group-hover:opacity-100',
                        picker ? 'opacity-100' : 'opacity-0',
                      ),
                )}
              >
                <ActionButton label="React" onClick={() => setPicker((p) => !p)} expanded={picker}>
                  <SmileyIcon size={16} />
                </ActionButton>
                <ActionButton label="Reply" onClick={() => onReply(m)}>
                  <ArrowBendUpLeftIcon size={16} />
                </ActionButton>
                {!prefs.alwaysShowActions && m.kind === 'text' && (
                  <ActionButton label="Copy text" onClick={copy}>
                    <CopyIcon size={15} />
                  </ActionButton>
                )}
                {!prefs.alwaysShowActions && mine && (
                  <ActionButton label="Delete for everyone" onClick={() => onDelete(m)} danger>
                    <TrashIcon size={15} />
                  </ActionButton>
                )}
                <ActionButton label="More actions" onClick={openMenu}>
                  <DotsThreeIcon size={16} />
                </ActionButton>
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
                // While selecting, the click falls through to the row and toggles selection.
                onClick={selecting ? undefined : () => onReact(m, emoji)}
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
            onClick={selecting ? undefined : () => onRetry(m)}
            className="mr-1 mt-0.5 text-xs font-medium text-danger underline-offset-2 hover:underline"
          >
            Not sent · Retry
          </button>
        )}
      </div>
    </MessageMenu>
  );
});
