import { describe, expect, it } from 'vitest';
import {
  displayToPayload,
  insertMentionDisplay,
  mentionsToDisplay,
  unreadMentions,
  viewOnceFormat,
  VIEW_ONCE_TYPES,
} from './compose';
import { searchMessages } from './features';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const names: Record<string, string> = { [A]: 'Maya Chen', [B]: 'Leo', [C]: 'Leo' };
const nameOf = (id: string) => names[id] ?? 'someone';

describe('mentions in the composer', () => {
  it('shows validated tokens as @Name and keeps the others literal', () => {
    const r = mentionsToDisplay(`Hi @[${A}] and @[${B}], not @[${C}]`, [A, B], nameOf);
    expect(r.text).toBe(`Hi @Maya Chen and @Leo, not @[${C}]`);
    expect(r.entries).toEqual([
      { userId: A, name: 'Maya Chen' },
      { userId: B, name: 'Leo' },
    ]);
  });

  it('turns picked names back into tokens, in any order, after edits', () => {
    const entries = [
      { userId: B, name: 'Leo' },
      { userId: A, name: 'Maya Chen' },
    ];
    const r = displayToPayload('@Maya Chen, ask @Leo!', entries);
    expect(r.body).toBe(`@[${A}], ask @[${B}]!`);
    expect(r.mentions).toEqual([A, B]);
  });

  it('drops a mention whose name was edited away and never matches part of a word', () => {
    const entries = [{ userId: B, name: 'Leo' }];
    expect(displayToPayload('@Leon is here', entries)).toEqual({
      body: '@Leon is here',
      mentions: [],
    });
    expect(displayToPayload('no one', entries)).toEqual({ body: 'no one', mentions: [] });
  });

  it('keeps two people with the same name apart', () => {
    const entries = [
      { userId: B, name: 'Leo' },
      { userId: C, name: 'Leo' },
    ];
    const r = displayToPayload('@Leo and @Leo', entries);
    expect(r.body).toBe(`@[${B}] and @[${C}]`);
    expect(r.mentions).toEqual([B, C]);
  });

  it('a typed "@Name" that was never picked stays plain text', () => {
    expect(displayToPayload('@Leo hi', [])).toEqual({ body: '@Leo hi', mentions: [] });
  });

  it('inserts the picked name at the query', () => {
    expect(insertMentionDisplay('hi @ma', 3, 6, 'Maya Chen')).toEqual({
      text: 'hi @Maya Chen ',
      cursor: 14,
    });
  });
});

describe('unread mentions', () => {
  it('lists unread messages that mention me, oldest first', () => {
    const msgs = [
      { id: 'a', seq: 3, senderId: B, mentions: [A] },
      { id: 'b', seq: 7, senderId: B, mentions: [A] },
      { id: 'c', seq: 5, senderId: B, mentions: [A] },
      { id: 'd', seq: 9, senderId: B, mentions: [C] },
      { id: 'e', seq: 8, senderId: A, mentions: [A] },
      { id: 'f', seq: 10, senderId: B, mentions: [A], deleted: true },
      { id: 'g', seq: null, senderId: B, mentions: [A] },
    ];
    expect(unreadMentions(msgs, A, 4)).toEqual(['c', 'b']);
  });
});

describe('view once formats', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it('allows only what the viewer can show', () => {
    expect(VIEW_ONCE_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
    ]);
    expect(viewOnceFormat(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(viewOnceFormat(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe('video/webm');
    // QuickTime (.mov) and anything unknown can't be sent view once.
    expect(viewOnceFormat(bytes(0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20))).toBe(
      null,
    );
    expect(viewOnceFormat(new TextEncoder().encode('<svg></svg>          '))).toBe(null);
  });
});

describe('search never uses the sender-supplied contact name', () => {
  const card = {
    id: 'k',
    createdAt: '2026-10-01T00:00:00Z',
    contact: { userId: A, displayName: 'Your Bank', username: 'bank' },
  };
  it('finds a card as "Contact card" and by the server name only when known', () => {
    expect(searchMessages([card], 'bank')).toEqual([]);
    expect(searchMessages([card], 'your')).toEqual([]);
    expect(searchMessages([card], 'contact card').map((h) => h.message.id)).toEqual(['k']);
    expect(
      searchMessages([card], 'maya', { contactName: (id) => (id === A ? 'Maya Chen' : undefined) })
        .length,
    ).toBe(1);
    expect(searchMessages([card], 'maya')).toEqual([]);
  });
});
