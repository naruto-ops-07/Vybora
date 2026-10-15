import { describe, expect, it } from 'vitest';
import { layoutThread, type ThreadItem } from './layout';

type M = { id: string; senderId: string; createdAt: string; seq: number | null };
const opts = {
  myUserId: 'me',
  lastReadSeq: 100,
  now: new Date('2026-10-15T20:00:00Z'),
  timeZone: 'UTC',
  locale: 'en-GB',
};
const msg = (id: string, senderId: string, createdAt: string, seq: number | null = Number(id)) => ({
  id,
  senderId,
  createdAt,
  seq,
});
const shape = (items: ThreadItem<M>[]) =>
  items.map((i) =>
    i.type === 'message'
      ? `${i.key}${i.runStart ? '<' : ''}${i.runEnd ? '>' : ''}`
      : i.type === 'date'
        ? `[${i.label}]`
        : `(${i.count} unread)`,
  );

describe('layoutThread', () => {
  it('returns nothing for an empty chat', () => {
    expect(layoutThread([], opts)).toEqual([]);
  });

  it('groups consecutive messages from one sender into a run', () => {
    const items = layoutThread(
      [msg('1', 'maya', '2026-10-15T10:00:00Z'), msg('2', 'maya', '2026-10-15T10:01:00Z')],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '1<', '2>']);
  });

  it('starts a new run on sender change or a 5-minute gap', () => {
    const items = layoutThread(
      [
        msg('1', 'maya', '2026-10-15T10:00:00Z'),
        msg('2', 'me', '2026-10-15T10:01:00Z'),
        msg('3', 'me', '2026-10-15T10:06:00Z'),
      ],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '1<>', '2<>', '3<>']);
  });

  it('inserts a date item at each day boundary and breaks the run', () => {
    const items = layoutThread(
      [msg('1', 'maya', '2026-10-14T23:59:00Z'), msg('2', 'maya', '2026-10-15T00:00:30Z')],
      opts,
    );
    expect(shape(items)).toEqual(['[Yesterday]', '1<>', '[Today]', '2<>']);
  });

  it('places one unread divider before the first unread incoming message', () => {
    const items = layoutThread(
      [
        msg('99', 'maya', '2026-10-15T10:00:00Z'),
        msg('101', 'maya', '2026-10-15T10:01:00Z'),
        msg('102', 'me', '2026-10-15T10:02:00Z'),
        msg('103', 'maya', '2026-10-15T10:03:00Z'),
      ],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '99<>', '(2 unread)', '101<>', '102<>', '103<>']);
  });

  it('shows no divider when everything is read, mine, or still sending', () => {
    const items = layoutThread(
      [
        msg('90', 'maya', '2026-10-15T10:00:00Z'),
        msg('120', 'me', '2026-10-15T10:01:00Z'),
        msg('x', 'maya', '2026-10-15T10:02:00Z', null),
      ],
      opts,
    );
    expect(items.some((i) => i.type === 'unread')).toBe(false);
  });

  it('ignores messages that arrived after the chat was opened', () => {
    const items = layoutThread(
      [msg('101', 'maya', '2026-10-15T10:01:00Z'), msg('102', 'maya', '2026-10-15T10:02:00Z')],
      { ...opts, lastReadSeq: 100, unreadUntilSeq: 101 },
    );
    expect(shape(items)).toEqual(['[Today]', '(1 unread)', '101<', '102>']);
  });

  it('shows no divider when nothing was unread at open', () => {
    const items = layoutThread(
      [msg('101', 'maya', '2026-10-15T10:01:00Z'), msg('102', 'maya', '2026-10-15T10:02:00Z')],
      { ...opts, lastReadSeq: 100, unreadUntilSeq: 100 },
    );
    expect(items.some((i) => i.type === 'unread')).toBe(false);
  });

  it('marks mine correctly', () => {
    const [, first] = layoutThread([msg('1', 'me', '2026-10-15T10:00:00Z')], opts);
    expect(first).toMatchObject({ type: 'message', mine: true });
  });
});
