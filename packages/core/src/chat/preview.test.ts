import { describe, expect, it } from 'vitest';
import {
  chatRowPreview,
  headerStatus,
  canForward,
  messageActions,
  messageSummary,
  receiptOf,
  selectionToText,
} from './preview';
import { swipeReplyDecision } from './swipe';

const names: Record<string, string> = { maya: 'Maya', leo: 'Leo', me: 'You' };
const nameOf = (id: string) => names[id] ?? 'Someone';
const text = (senderId: string, body: string) => ({ senderId, kind: 'text' as const, body });

describe('receiptOf', () => {
  const members = [
    { id: 'me', read_seq: 0, delivered_seq: 0 },
    { id: 'maya', read_seq: 5, delivered_seq: 8 },
  ];
  it('derives ticks from the other members’ positions', () => {
    expect(
      receiptOf({ senderId: 'maya', status: 'received', seq: 3 }, 'me', members),
    ).toBeUndefined();
    expect(receiptOf({ senderId: 'me', status: 'sending', seq: null }, 'me', members)).toBe(
      'sending',
    );
    expect(receiptOf({ senderId: 'me', status: 'failed', seq: null }, 'me', members)).toBe(
      'failed',
    );
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 5 }, 'me', members)).toBe('read');
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 7 }, 'me', members)).toBe('delivered');
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 9 }, 'me', members)).toBe('sent');
  });
});

describe('messageSummary', () => {
  it('describes every kind without leaking more than the local preview', () => {
    expect(messageSummary(text('maya', 'Hi'))).toBe('Hi');
    expect(
      messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'image' } }),
    ).toBe('Photo');
    expect(
      messageSummary({
        senderId: 'maya',
        kind: 'attachment',
        attachment: { kind: 'image' },
        caption: 'Beach',
      }),
    ).toBe('Beach');
    expect(
      messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'voice' } }),
    ).toBe('Voice message');
    expect(
      messageSummary({
        senderId: 'maya',
        kind: 'attachment',
        attachment: { kind: 'file', name: 'a.pdf' },
      }),
    ).toBe('File: a.pdf');
    expect(messageSummary({ senderId: 'maya', kind: 'unsupported' })).toBe(
      'Update VYBORA to see this message',
    );
    expect(messageSummary({ senderId: 'maya', kind: 'undecryptable' })).toBe(
      'Message couldn’t be decrypted',
    );
    expect(messageSummary({ ...text('maya', 'secret'), deleted: true })).toBe(
      'This message was deleted',
    );
  });
});

describe('chatRowPreview', () => {
  const base = { myUserId: 'me', typingUserIds: [], nameOf };
  it('prefixes my messages with You and keeps the receipt', () => {
    expect(
      chatRowPreview(text('me', 'See you'), { ...base, isGroup: false, receipt: 'read' }),
    ).toEqual({
      prefix: 'You',
      text: 'See you',
      receipt: 'read',
      typing: false,
    });
  });
  it('prefixes group messages with the sender and direct ones with nothing', () => {
    expect(chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: true }).prefix).toBe('Maya');
    expect(chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: false }).prefix).toBeNull();
  });
  it('lets typing win over the last message', () => {
    expect(
      chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: false, typingUserIds: ['maya'] }),
    ).toEqual({
      prefix: null,
      text: 'typing…',
      receipt: null,
      typing: true,
    });
    expect(
      chatRowPreview(undefined, { ...base, isGroup: true, typingUserIds: ['maya'] }).text,
    ).toBe('Maya is typing…');
    expect(
      chatRowPreview(undefined, { ...base, isGroup: true, typingUserIds: ['maya', 'leo'] }).text,
    ).toBe('2 people are typing…');
  });
  it('ignores my own typing and handles empty chats', () => {
    expect(chatRowPreview(undefined, { ...base, isGroup: false, typingUserIds: ['me'] })).toEqual({
      prefix: null,
      text: 'No messages yet',
      receipt: null,
      typing: false,
    });
  });
});

describe('selectionToText', () => {
  it('joins selected messages as [time] name: text lines', () => {
    expect(
      selectionToText(
        [
          { ...text('maya', 'Dinner?'), createdAt: '2026-10-15T18:01:00Z' },
          { ...text('me', 'Yes'), createdAt: '2026-10-15T18:02:00Z' },
        ],
        { nameOf, timeZone: 'UTC', locale: 'en-GB' },
      ),
    ).toBe('[18:01] Maya: Dinner?\n[18:02] You: Yes');
  });
});

describe('headerStatus', () => {
  const base = {
    isGroup: false,
    memberCount: 2,
    typingNames: [],
    online: false,
    lastSeenAt: null,
    now: new Date('2026-10-15T14:05:30Z'),
    timeZone: 'UTC',
    locale: 'en-GB',
  };
  it('prefers typing, then online, then last seen, then the fallback', () => {
    expect(headerStatus({ ...base, typingNames: ['Maya'], online: true })).toBe('typing…');
    expect(headerStatus({ ...base, online: true, lastSeenAt: '2026-10-15T09:00:00Z' })).toBe(
      'online',
    );
    expect(headerStatus({ ...base, lastSeenAt: '2026-10-15T09:12:00Z' })).toBe(
      'last seen today at 09:12',
    );
    expect(headerStatus(base)).toBe('end-to-end encrypted');
  });
  it('shows group typing names and member counts', () => {
    expect(
      headerStatus({ ...base, isGroup: true, memberCount: 5, typingNames: ['Maya', 'Leo'] }),
    ).toBe('Maya, Leo are typing…');
    expect(headerStatus({ ...base, isGroup: true, memberCount: 5, typingNames: ['Maya'] })).toBe(
      'Maya is typing…',
    );
    expect(headerStatus({ ...base, isGroup: true, memberCount: 5 })).toBe('5 members');
  });
});

describe('messageActions', () => {
  it('offers actions only for settled, readable messages', () => {
    expect(messageActions({ kind: 'text', status: 'sent' }, true)).toEqual([
      'reply',
      'copy',
      'select',
      'delete',
    ]);
    expect(messageActions({ kind: 'attachment', status: 'received' }, false)).toEqual([
      'reply',
      'select',
    ]);
    expect(messageActions({ kind: 'text', status: 'sending' }, true)).toEqual([]);
    expect(messageActions({ kind: 'text', status: 'failed' }, true)).toEqual([]);
    expect(messageActions({ kind: 'undecryptable', status: 'received' }, false)).toEqual([]);
    expect(messageActions({ kind: 'text', status: 'sent', deleted: true }, true)).toEqual([]);
  });
});

describe('messageActions with context (wave A)', () => {
  const now = new Date('2026-10-22T10:05:00Z');
  const ctx = { myUserId: 'me', now, isGroup: false, canPin: true, pinned: false };
  const mineText = {
    kind: 'text',
    status: 'sent',
    senderId: 'me',
    createdAt: '2026-10-22T10:00:00Z',
  };
  const theirs = { ...mineText, senderId: 'maya', status: 'received' };

  it('adds edit, forward, star, pin and info for my recent text, in menu order', () => {
    expect(messageActions(mineText, true, ctx)).toEqual([
      'reply',
      'copy',
      'edit',
      'forward',
      'star',
      'pin',
      'info',
      'select',
      'delete',
    ]);
  });

  it('offers unstar and unpin when already starred or pinned', () => {
    const a = messageActions({ ...theirs, starred: true }, false, { ...ctx, pinned: true });
    expect(a).toContain('unstar');
    expect(a).toContain('unpin');
    expect(a).not.toContain('star');
    expect(a).not.toContain('pin');
  });

  it('offers edit only inside the window, never for others', () => {
    expect(
      messageActions(mineText, true, { ...ctx, now: new Date('2026-10-22T10:16:00Z') }),
    ).not.toContain('edit');
    expect(messageActions(theirs, false, ctx)).not.toContain('edit');
  });

  it('hides pin without permission and info for messages from others', () => {
    expect(messageActions(theirs, false, { ...ctx, canPin: false })).not.toContain('pin');
    expect(messageActions(theirs, false, ctx)).not.toContain('info');
  });

  it('offers reply privately only on group messages from others', () => {
    expect(messageActions(theirs, false, { ...ctx, isGroup: true })).toEqual([
      'reply',
      'replyPrivately',
      'copy',
      'forward',
      'star',
      'pin',
      'select',
    ]);
    expect(messageActions(mineText, true, { ...ctx, isGroup: true })).not.toContain(
      'replyPrivately',
    );
    expect(messageActions(theirs, false, ctx)).not.toContain('replyPrivately');
  });

  it('never forwards polls, view once or unsupported messages', () => {
    for (const m of [
      { ...theirs, kind: 'poll' },
      { ...theirs, kind: 'unsupported' },
      { ...theirs, kind: 'attachment', viewOnce: { kind: 'image', consumed: false } },
    ])
      expect(messageActions(m, false, ctx)).not.toContain('forward');
    expect(messageActions({ ...theirs, kind: 'contact' }, false, ctx)).toContain('forward');
    expect(messageActions({ ...theirs, kind: 'location' }, false, ctx)).toContain('forward');
  });

  it('offers nothing for unsettled, deleted or undecryptable messages', () => {
    expect(messageActions({ ...mineText, status: 'sending' }, true, ctx)).toEqual([]);
    expect(messageActions({ ...mineText, status: 'failed' }, true, ctx)).toEqual([]);
    expect(messageActions({ ...mineText, deleted: true }, true, ctx)).toEqual([]);
    expect(messageActions({ ...theirs, kind: 'undecryptable' }, false, ctx)).toEqual([]);
  });

  it('canForward matches the engine’s rule', () => {
    expect(canForward({ kind: 'text', status: 'sent' })).toBe(true);
    expect(canForward({ kind: 'attachment', status: 'received' })).toBe(true);
    expect(canForward({ kind: 'text', status: 'sending' })).toBe(false);
    expect(canForward({ kind: 'text', status: 'failed' })).toBe(false);
    expect(canForward({ kind: 'text', status: 'sent', deleted: true })).toBe(false);
    expect(canForward({ kind: 'undecryptable', status: 'received' })).toBe(false);
    expect(canForward({ kind: 'poll', status: 'sent' })).toBe(false);
  });
});

describe('swipeReplyDecision', () => {
  it('arms at 64px, triggers on release or a fast flick, never for vertical drags', () => {
    expect(swipeReplyDecision({ dx: 30, dy: 0, vx: 0, released: false })).toBe('idle');
    expect(swipeReplyDecision({ dx: 64, dy: 0, vx: 0, released: false })).toBe('armed');
    expect(swipeReplyDecision({ dx: 70, dy: 0, vx: 0, released: true })).toBe('trigger');
    expect(swipeReplyDecision({ dx: 30, dy: 0, vx: 900, released: true })).toBe('trigger');
    expect(swipeReplyDecision({ dx: 20, dy: 0, vx: 900, released: true })).toBe('idle');
    expect(swipeReplyDecision({ dx: 70, dy: 90, vx: 0, released: true })).toBe('idle');
    expect(swipeReplyDecision({ dx: -80, dy: 0, vx: 0, released: true })).toBe('idle');
  });
});
