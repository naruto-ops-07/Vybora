import { describe, expect, it } from 'vitest';
import {
  EDIT_WINDOW_MS,
  canEditMessage,
  canPin,
  canCaption,
  editWindowRemainingMs,
  formatCoordinates,
  mapLinkFor,
  matchRanges,
  pollVotesLabel,
  insertMention,
  mentionIdsIn,
  mentionQueryAt,
  mentionsMe,
  messageInfo,
  nextPins,
  parseMentions,
  pinWouldReplace,
  pollTally,
  renderMentions,
  searchMessages,
  searchSnippet,
  toggleVote,
  validatePollDraft,
} from './features';
import { chatRowPreview, messageSummary } from './preview';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const t0 = '2026-10-22T10:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(t0) + ms);

describe('edit window', () => {
  const mine = { senderId: A, kind: 'text', status: 'sent', createdAt: t0 };
  it('allows my sent text/attachment for 15 minutes', () => {
    expect(canEditMessage(mine, A, at(EDIT_WINDOW_MS - 1))).toBe(true);
    expect(canEditMessage(mine, A, at(EDIT_WINDOW_MS))).toBe(false);
    expect(canEditMessage(mine, B, at(1000))).toBe(false);
    expect(canEditMessage({ ...mine, kind: 'poll' }, A, at(1000))).toBe(false);
    expect(canEditMessage({ ...mine, status: 'sending' }, A, at(1000))).toBe(false);
    expect(canEditMessage({ ...mine, deleted: true }, A, at(1000))).toBe(false);
    expect(canEditMessage({ ...mine, kind: 'attachment', viewOnce: {} }, A, at(1))).toBe(false);
    // My own message synced from my other device arrives as 'received'.
    expect(canEditMessage({ ...mine, status: 'received' }, A, at(1000))).toBe(true);
    expect(canEditMessage({ ...mine, status: 'failed' }, A, at(1000))).toBe(false);
    expect(editWindowRemainingMs(t0, at(60_000))).toBe(EDIT_WINDOW_MS - 60_000);
  });
});

describe('pins', () => {
  it('caps at 3 and tells the UI which pin a 4th would replace', () => {
    let pins = nextPins([], { messageId: 'a', pinned: true, by: A, at: '1' });
    pins = nextPins(pins, { messageId: 'b', pinned: true, by: A, at: '2' });
    pins = nextPins(pins, { messageId: 'c', pinned: true, by: A, at: '3' });
    expect(pinWouldReplace(pins, 'd')?.messageId).toBe('a');
    expect(pinWouldReplace(pins, 'b')).toBeNull();
    pins = nextPins(pins, { messageId: 'd', pinned: true, by: A, at: '4' });
    expect(pins.map((p) => p.messageId)).toEqual(['b', 'c', 'd']);
  });
  it('follows the admins-only setting in groups', () => {
    expect(canPin({ isGroup: false })).toBe(true);
    expect(canPin({ isGroup: true, settingsPolicy: 'everyone', myRole: 'member' })).toBe(true);
    expect(canPin({ isGroup: true, settingsPolicy: 'admins', myRole: 'member' })).toBe(false);
    expect(canPin({ isGroup: true, settingsPolicy: 'admins', myRole: 'admin' })).toBe(true);
  });
});

describe('polls', () => {
  it('tallies current votes', () => {
    const t = pollTally(
      { question: 'Q', options: ['x', 'y', 'z'], multi: true, votes: { [A]: [0, 1], [B]: [1, 9] } },
      A,
    );
    expect(t.totalVoters).toBe(2);
    expect(t.options.map((o) => o.count)).toEqual([1, 2, 0]);
    expect(t.options[1]!.voters).toEqual([A, B]);
    expect(t.options[1]!.share).toBe(1);
    expect(t.leading).toEqual([1]);
    expect(t.myChoices).toEqual([0, 1]);
    expect(
      pollTally({ question: 'Q', options: ['x', 'y'], multi: false, votes: {} }).leading,
    ).toEqual([]);
  });
  it('toggles and validates drafts', () => {
    expect(toggleVote({ multi: false }, [0], 1)).toEqual([1]);
    expect(toggleVote({ multi: false }, [1], 1)).toEqual([]);
    expect(toggleVote({ multi: true }, [2], 0)).toEqual([0, 2]);
    expect(validatePollDraft('Q', ['a', ''])).toBe('too_few_options');
    expect(validatePollDraft('Q', ['a', 'A'])).toBe('duplicate_options');
    expect(validatePollDraft(' ', ['a', 'b'])).toBe('question_required');
    expect(validatePollDraft('Q', ['a', 'b'])).toBeNull();
  });
});

describe('mentions', () => {
  const body = `hey @[${A}] and @[${B}]!`;
  it('parses, renders and finds tokens', () => {
    expect(parseMentions(body, [A])).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', userId: A, valid: true },
      { type: 'text', text: ' and ' },
      { type: 'mention', userId: B, valid: false },
      { type: 'text', text: '!' },
    ]);
    const names = (id: string) => (id === A ? 'Maya' : 'Sam');
    expect(renderMentions(body, [A, B], names)).toBe('hey @Maya and @Sam!');
    // Unvalidated tokens stay literal: never shown as someone's name.
    expect(renderMentions(body, [A], names)).toBe(`hey @Maya and @[${B}]!`);
    expect(renderMentions(body, undefined, names)).toBe(body);
    expect(mentionIdsIn(body)).toEqual([A, B]);
    expect(mentionsMe({ mentions: [A] }, A)).toBe(true);
    expect(mentionsMe({}, A)).toBe(false);
  });
  it('detects the @query at the cursor and inserts a token', () => {
    expect(mentionQueryAt('hi @ma', 6)).toEqual({ start: 3, query: 'ma' });
    expect(mentionQueryAt('mail@x', 6)).toBeNull();
    const r = insertMention('hi @ma', 3, 6, A);
    expect(r.text).toBe(`hi @[${A}] `);
    expect(r.cursor).toBe(r.text.length);
  });
});

describe('messageSummary for new kinds (local previews)', () => {
  it('describes each kind', () => {
    const s = (m: object) => messageSummary({ senderId: A, kind: 'text', ...m } as never);
    // The card's own name is sender-supplied (spoofable): previews never repeat it.
    expect(s({ kind: 'contact', contact: { displayName: 'Your Bank', username: 'bank' } })).toBe(
      'Contact card',
    );
    expect(s({ kind: 'location', location: { label: 'Home' } })).toBe('Location: Home');
    expect(s({ kind: 'location', location: {} })).toBe('Location');
    expect(s({ kind: 'poll', poll: { question: 'Dinner?' } })).toBe('Poll: Dinner?');
    expect(s({ kind: 'attachment', viewOnce: { kind: 'image', consumed: false } })).toBe(
      'View once photo',
    );
    expect(s({ kind: 'attachment', viewOnce: { kind: 'image', consumed: true } })).toBe('Opened');
    // The sender's own copy never claims it was opened (the sender can't know).
    const mineVo = { senderId: A, kind: 'attachment', viewOnce: { kind: 'video', consumed: true } };
    expect(messageSummary(mineVo as never, { myUserId: A })).toBe('View once video');
    expect(messageSummary(mineVo as never, { myUserId: B })).toBe('Opened');
    // Captions never ride on view once.
    expect(
      s({ kind: 'attachment', caption: 'secret', viewOnce: { kind: 'image', consumed: false } }),
    ).toBe('View once photo');
    expect(
      chatRowPreview(mineVo as never, {
        myUserId: A,
        isGroup: false,
        typingUserIds: [],
        nameOf: () => 'x',
      }).text,
    ).toBe('View once video');
    expect(s({ body: `hi @[${A}]`, mentions: [A] })).toBe('hi @someone');
    expect(s({ body: `hi @[${A}]` })).toBe(`hi @[${A}]`);
    const row = chatRowPreview(
      { senderId: B, kind: 'text', body: `hi @[${A}]`, mentions: [A] },
      { myUserId: A, isGroup: true, typingUserIds: [], nameOf: () => 'Maya' },
    );
    expect(row.text).toBe('hi @Maya');
  });
});

describe('local search', () => {
  const msgs = [
    { id: '1', createdAt: '2026-10-01T00:00:00Z', body: 'Café at noon?' },
    {
      id: '2',
      createdAt: '2026-10-02T00:00:00Z',
      body: 'cafe tomorrow with @[' + A + ']',
      mentions: [A],
    },
    { id: '5', createdAt: '2026-10-05T00:00:00Z', body: 'forged @[' + B + ']' },
    { id: '3', createdAt: '2026-10-03T00:00:00Z', poll: { question: 'Which?', options: ['Cafe'] } },
    { id: '4', createdAt: '2026-10-04T00:00:00Z', body: 'cafe', deleted: true },
  ];
  it('matches all words, accent-insensitive, newest first, skipping deleted', () => {
    const hits = searchMessages(msgs, 'CAFE');
    expect(hits.map((h) => h.message.id)).toEqual(['3', '2', '1']);
    expect(hits[2]!.ranges).toEqual([[0, 4]]);
    expect(
      searchMessages(msgs, 'cafe maya', { nameOf: () => 'Maya' }).map((h) => h.message.id),
    ).toEqual(['2']);
    expect(searchMessages(msgs, '   ')).toEqual([]);
    // An unvalidated token isn't searchable by the name it claims.
    expect(searchMessages(msgs, 'forged sam', { nameOf: () => 'Sam' })).toEqual([]);
  });
  it('marks every match of the query in a piece of text', () => {
    expect(matchRanges('Café at the cafe', 'cafe')).toEqual([
      [0, 4],
      [12, 16],
    ]);
    expect(matchRanges('Dinner at eight', 'at eight')).toEqual([
      [7, 9],
      [10, 15],
    ]);
    expect(matchRanges('nothing here', 'cafe')).toEqual([]);
    expect(matchRanges('', 'a')).toEqual([]);
    expect(matchRanges('anything', '  ')).toEqual([]);
  });

  it('builds a snippet around the first match', () => {
    const text = `${'x'.repeat(100)} needle ${'y'.repeat(100)}`;
    const snip = searchSnippet({ text, ranges: [[101, 107]] }, 10);
    expect(snip.text.startsWith('…')).toBe(true);
    const [a, b] = snip.ranges[0]!;
    expect(snip.text.slice(a, b)).toBe('needle');
  });
});

describe('message info', () => {
  it('splits members by read / delivered / pending from receipts', () => {
    const info = messageInfo({ senderId: A, seq: 10 }, [
      { id: A, read_seq: 10, delivered_seq: 10 },
      { id: B, read_seq: 10, delivered_seq: 10 },
      { id: 'c', read_seq: 5, delivered_seq: 12 },
      { id: 'd', read_seq: 0, delivered_seq: 3 },
    ]);
    expect(info.read.map((r) => r.userId)).toEqual([B]);
    expect(info.delivered.map((r) => r.userId)).toEqual(['c']);
    expect(info.pending.map((r) => r.userId)).toEqual(['d']);
    expect(
      messageInfo({ senderId: A, seq: null }, [{ id: B, read_seq: 9, delivered_seq: 9 }]).pending,
    ).toHaveLength(1);
  });
});

describe('location', () => {
  it('formats coordinates to 5 decimals', () => {
    expect(formatCoordinates(51.5073509, -0.1277583)).toBe('51.50735, -0.12776');
    expect(formatCoordinates(0, 0)).toBe('0.00000, 0.00000');
  });

  it('links to OpenStreetMap at the pin, zoom 16', () => {
    expect(mapLinkFor(51.5073509, -0.1277583)).toBe(
      'https://www.openstreetmap.org/?mlat=51.50735&mlon=-0.12776#map=16/51.50735/-0.12776',
    );
  });
});

describe('pollVotesLabel', () => {
  it('counts voters in plain words', () => {
    expect(pollVotesLabel(0)).toBe('No votes yet');
    expect(pollVotesLabel(1)).toBe('1 vote');
    expect(pollVotesLabel(7)).toBe('7 votes');
  });
});

describe('canCaption', () => {
  it('allows a caption on a normal attachment, never on view once', () => {
    expect(canCaption({})).toBe(true);
    expect(canCaption({ viewOnce: true })).toBe(false);
  });
});
