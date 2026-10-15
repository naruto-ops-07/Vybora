import { dayKey, dayLabel, type TimeOpts } from './time';

export interface ThreadMessageLike {
  id: string;
  senderId: string;
  createdAt: string;
  seq: number | null;
}

export type ThreadItem<M extends ThreadMessageLike> =
  | { type: 'date'; key: string; label: string; day: string }
  | { type: 'unread'; key: 'unread'; count: number }
  | {
      type: 'message';
      key: string;
      message: M;
      mine: boolean;
      /** First bubble of a run: shows the sender name in groups. */
      runStart: boolean;
      /** Last bubble of a run: gets the tail (and the avatar in groups). */
      runEnd: boolean;
    };

export interface LayoutOptions extends TimeOpts {
  myUserId: string;
  /** Read position captured when the chat was opened (not the live value). */
  lastReadSeq: number;
  now: Date;
}

export const RUN_GAP_MS = 5 * 60_000;

type MessageItem<M extends ThreadMessageLike> = Extract<ThreadItem<M>, { type: 'message' }>;

/** Turn ascending messages into render items: date chips, one unread divider, runs. */
export function layoutThread<M extends ThreadMessageLike>(
  messages: readonly M[],
  opts: LayoutOptions,
): ThreadItem<M>[] {
  const isUnread = (m: M) =>
    m.senderId !== opts.myUserId && m.seq !== null && m.seq > opts.lastReadSeq;
  const firstUnread = messages.findIndex(isUnread);
  const unreadCount = firstUnread < 0 ? 0 : messages.slice(firstUnread).filter(isUnread).length;

  const items: ThreadItem<M>[] = [];
  let lastMessage: MessageItem<M> | undefined;
  let prev: M | undefined;
  let prevDay = '';

  messages.forEach((m, i) => {
    let breakRun = false;
    const day = dayKey(m.createdAt, opts);
    if (day !== prevDay) {
      items.push({
        type: 'date',
        key: `date-${day}`,
        label: dayLabel(m.createdAt, opts.now, opts),
        day,
      });
      prevDay = day;
      breakRun = true;
    }
    if (i === firstUnread) {
      items.push({ type: 'unread', key: 'unread', count: unreadCount });
      breakRun = true;
    }
    const runStart =
      breakRun ||
      !prev ||
      prev.senderId !== m.senderId ||
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) >= RUN_GAP_MS;
    if (runStart && lastMessage) lastMessage.runEnd = true;
    const item: MessageItem<M> = {
      type: 'message',
      key: m.id,
      message: m,
      mine: m.senderId === opts.myUserId,
      runStart,
      runEnd: false,
    };
    items.push(item);
    lastMessage = item;
    prev = m;
  });
  if (lastMessage) lastMessage.runEnd = true;
  return items;
}
