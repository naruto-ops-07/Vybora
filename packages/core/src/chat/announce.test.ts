import { describe, expect, it } from 'vitest';
import { nextAnnouncement, type AnnounceMark } from './announce';

const msg = (seq: number | null, senderId = 'maya') => ({ id: `m${seq}`, seq, senderId });

describe('nextAnnouncement', () => {
  it('is silent on first load and announces a newer incoming message', () => {
    const first = nextAnnouncement(null, [msg(1), msg(2)], 'c1', 'me');
    expect(first).toEqual({ mark: { conv: 'c1', seq: 2 }, announce: null });
    const next = nextAnnouncement(first.mark, [msg(1), msg(2), msg(3)], 'c1', 'me');
    expect(next.announce?.seq).toBe(3);
    expect(next.mark).toEqual({ conv: 'c1', seq: 3 });
  });

  it('ignores my own and pending messages', () => {
    const mark: AnnounceMark = { conv: 'c1', seq: 2 };
    expect(nextAnnouncement(mark, [msg(2), msg(3, 'me'), msg(null)], 'c1', 'me').announce).toBe(
      null,
    );
  });

  it('does not re-announce older messages when the newest incoming one expires', () => {
    const mark: AnnounceMark = { conv: 'c1', seq: 3 };
    const after = nextAnnouncement(mark, [msg(1), msg(2)], 'c1', 'me');
    expect(after).toEqual({ mark, announce: null });
    // A genuinely new message is still announced afterwards.
    expect(nextAnnouncement(after.mark, [msg(1), msg(2), msg(4)], 'c1', 'me').announce?.seq).toBe(
      4,
    );
  });

  it('resets silently when the chat changes', () => {
    const mark: AnnounceMark = { conv: 'c1', seq: 9 };
    expect(nextAnnouncement(mark, [msg(1)], 'c2', 'me')).toEqual({
      mark: { conv: 'c2', seq: 1 },
      announce: null,
    });
  });
});
