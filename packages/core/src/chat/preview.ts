import { canEditMessage, renderMentions } from './features';
import { formatClock, formatLastSeen, type TimeOpts } from './time';

export type Receipt = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/** Ticks for my message, from every other member's delivered/read position. */
export function receiptOf(
  m: { senderId: string; status: string; seq: number | null },
  myUserId: string,
  members: readonly { id: string; read_seq: number; delivered_seq: number }[],
): Receipt | undefined {
  if (m.senderId !== myUserId) return undefined;
  if (m.status === 'sending') return 'sending';
  if (m.status === 'failed') return 'failed';
  const others = members.filter((x) => x.id !== myUserId);
  if (!m.seq || !others.length) return 'sent';
  if (others.every((o) => o.read_seq >= m.seq!)) return 'read';
  if (others.every((o) => o.delivered_seq >= m.seq!)) return 'delivered';
  return 'sent';
}

export interface PreviewMessageLike {
  senderId: string;
  kind: 'text' | 'attachment' | 'contact' | 'location' | 'poll' | 'undecryptable' | 'unsupported';
  body?: string;
  /** Validated mention ids; only these tokens render as names. */
  mentions?: readonly string[];
  caption?: string;
  attachment?: { kind: string; name?: string };
  deleted?: boolean;
  contact?: { displayName: string; username: string };
  location?: { label?: string };
  poll?: { question: string };
  viewOnce?: { kind: string; consumed: boolean };
}

const ATTACHMENT_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  voice: 'Voice message',
};

/** Shown for a message kind this build can't display (sent by a newer client). */
export const UNSUPPORTED_TEXT = 'Update VYBORA to see this message';

/**
 * One-line description of a decrypted message (never more than the device
 * already shows). Local only: never put this in a push or a log.
 * `nameOf` turns `@[userId]` mention tokens into `@Name`.
 */
export function messageSummary(
  m: PreviewMessageLike,
  opts: { nameOf?: (userId: string) => string } = {},
): string {
  if (m.deleted) return 'This message was deleted';
  if (m.kind === 'undecryptable') return 'Message couldn’t be decrypted';
  if (m.kind === 'unsupported') return UNSUPPORTED_TEXT;
  if (m.viewOnce) {
    const what = m.viewOnce.kind === 'video' ? 'video' : 'photo';
    return m.viewOnce.consumed ? 'Opened' : `View once ${what}`;
  }
  // The card's name and username come from the sender and could be anything (a
  // spoof): only the card itself shows the person, from the server's profile.
  if (m.kind === 'contact') return 'Contact card';
  if (m.kind === 'location')
    return m.location?.label ? `Location: ${m.location.label}` : 'Location';
  if (m.kind === 'poll') return `Poll: ${m.poll?.question ?? ''}`;
  if (m.kind === 'attachment') {
    const caption = m.caption?.trim();
    if (caption) return caption;
    const k = m.attachment?.kind ?? 'file';
    return ATTACHMENT_LABEL[k] ?? `File: ${m.attachment?.name ?? 'attachment'}`;
  }
  return m.body ? renderMentions(m.body, m.mentions, opts.nameOf) : '';
}

export interface RowPreview {
  prefix: string | null;
  text: string;
  receipt: Receipt | null;
  typing: boolean;
}

export function chatRowPreview(
  last: PreviewMessageLike | undefined,
  opts: {
    myUserId: string;
    isGroup: boolean;
    typingUserIds: readonly string[];
    nameOf: (userId: string) => string;
    receipt?: Receipt;
  },
): RowPreview {
  const typers = opts.typingUserIds.filter((id) => id !== opts.myUserId);
  if (typers.length) {
    const text = !opts.isGroup
      ? 'typing…'
      : typers.length === 1
        ? `${opts.nameOf(typers[0]!)} is typing…`
        : `${typers.length} people are typing…`;
    return { prefix: null, text, receipt: null, typing: true };
  }
  if (!last) return { prefix: null, text: 'No messages yet', receipt: null, typing: false };
  const mine = last.senderId === opts.myUserId;
  return {
    prefix: mine ? 'You' : opts.isGroup ? opts.nameOf(last.senderId) : null,
    text: messageSummary(last, { nameOf: opts.nameOf }),
    receipt: mine && !last.deleted ? (opts.receipt ?? null) : null,
    typing: false,
  };
}

/** Plain-text copy of selected messages: "[18:01] Maya: Dinner?" per line. */
export function selectionToText(
  messages: readonly (PreviewMessageLike & { createdAt: string })[],
  opts: TimeOpts & { nameOf: (userId: string) => string },
): string {
  return messages
    .map(
      (m) =>
        `[${formatClock(m.createdAt, opts)}] ${opts.nameOf(m.senderId)}: ${messageSummary(m, opts)}`,
    )
    .join('\n');
}

/** The line under a chat's name: typing → online → last seen → fallback. */
export function headerStatus(
  o: TimeOpts & {
    isGroup: boolean;
    memberCount: number;
    typingNames: readonly string[];
    online: boolean;
    lastSeenAt: string | null;
    now: Date;
  },
): string {
  if (o.typingNames.length) {
    if (!o.isGroup) return 'typing…';
    return `${o.typingNames.join(', ')} ${o.typingNames.length > 1 ? 'are' : 'is'} typing…`;
  }
  if (o.isGroup) return `${o.memberCount} members`;
  if (o.online) return 'online';
  if (o.lastSeenAt) return formatLastSeen(o.lastSeenAt, o.now, o);
  return 'end-to-end encrypted';
}

/** The original menu (mobile still uses only these). */
export type BasicMessageAction = 'reply' | 'copy' | 'select' | 'delete';

/** Every message menu action, in menu order (see `messageActions`). */
export type MessageAction =
  | BasicMessageAction
  | 'replyPrivately'
  | 'edit'
  | 'forward'
  | 'star'
  | 'unstar'
  | 'pin'
  | 'unpin'
  | 'info';

export interface ActionableLike {
  kind: string;
  status: string;
  deleted?: boolean;
  senderId?: string;
  createdAt?: string;
  viewOnce?: unknown;
  starred?: boolean;
}

/** What the full menu needs to know beyond the message itself. */
export interface MessageActionContext {
  myUserId: string;
  now: Date;
  isGroup: boolean;
  /** From `canPin` (chat kind, admins-only setting, my role). */
  canPin: boolean;
  /** The message is one of the chat's current pins. */
  pinned: boolean;
}

const FORWARDABLE = new Set(['text', 'attachment', 'contact', 'location']);

/** Whether a message can be forwarded (mirrors the engine's `not_forwardable` rule). */
export function canForward(m: Omit<ActionableLike, 'senderId' | 'createdAt'>): boolean {
  if (m.deleted || m.viewOnce || m.status === 'sending' || m.status === 'failed') return false;
  return FORWARDABLE.has(m.kind);
}

/**
 * What the message menu offers. Without `ctx`, only the original four (reply,
 * copy, select, delete); with it, also reply privately, edit, forward, star,
 * pin and message info, each only where it applies.
 */
export function messageActions(m: ActionableLike, mine: boolean): BasicMessageAction[];
export function messageActions(
  m: ActionableLike,
  mine: boolean,
  ctx: MessageActionContext,
): MessageAction[];
export function messageActions(
  m: ActionableLike,
  mine: boolean,
  ctx?: MessageActionContext,
): MessageAction[] {
  if (m.deleted || m.kind === 'undecryptable' || m.status === 'sending' || m.status === 'failed')
    return [];
  if (!ctx)
    return [
      'reply',
      ...(m.kind === 'text' ? (['copy'] as const) : []),
      'select',
      ...(mine ? (['delete'] as const) : []),
    ];
  const out: MessageAction[] = ['reply'];
  if (ctx.isGroup && !mine) out.push('replyPrivately');
  if (m.kind === 'text') out.push('copy');
  if (
    mine &&
    m.senderId !== undefined &&
    m.createdAt !== undefined &&
    canEditMessage({ ...m, senderId: m.senderId, createdAt: m.createdAt }, ctx.myUserId, ctx.now)
  )
    out.push('edit');
  if (canForward(m)) out.push('forward');
  out.push(m.starred ? 'unstar' : 'star');
  if (ctx.pinned) out.push('unpin');
  else if (ctx.canPin) out.push('pin');
  if (mine) out.push('info');
  out.push('select');
  if (mine) out.push('delete');
  return out;
}
