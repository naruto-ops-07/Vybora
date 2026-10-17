import { layoutThread } from '@vybora/core';
import { useMemo } from 'react';
import { Bubble } from '@/features/connect/Bubble';
import { DateChip, groupByDay, ThreadDay, UnreadDivider } from '@/features/connect/ThreadParts';
import { chatBackground, useChatTheme } from '@/features/connect/ui';
import { CREW, ME, nameOf, sampleThread } from '../sample';

const noop = () => undefined;
const THEME = {};

/** A group thread drawn by the real Bubble: runs, tails, names, replies, reactions, receipts. */
export function ThreadSection() {
  const def = useChatTheme(THEME);
  const now = useMemo(() => new Date(), []);
  const { messages, receipts, lastReadSeq } = useMemo(() => sampleThread(now), [now]);
  const days = useMemo(
    () => groupByDay(layoutThread(messages, { myUserId: ME.id, lastReadSeq, now })),
    [messages, lastReadSeq, now],
  );
  const people = [ME, ...CREW];
  const nameFor = (id: string) =>
    id === ME.id ? 'You' : nameOf(people.find((p) => p.id === id) ?? ME);
  return (
    <div
      className="max-w-3xl overflow-hidden rounded-lg border border-line bg-bg py-3"
      style={chatBackground(THEME, def)}
    >
      {days.map((day) => (
        <ThreadDay key={day.key}>
          {day.items.map((it) => {
            if (it.type === 'date') return <DateChip key={it.key} label={it.label} />;
            if (it.type === 'unread') return <UnreadDivider key={it.key} count={it.count} />;
            const m = it.message;
            const sender = people.find((p) => p.id === m.senderId);
            return (
              <Bubble
                key={it.key}
                message={m}
                mine={it.mine}
                theme={def}
                senderName={nameFor(m.senderId)}
                showSender={it.runStart}
                runStart={it.runStart}
                runEnd={it.runEnd}
                avatar={
                  !it.mine && sender
                    ? {
                        path: null,
                        name: sender.username,
                        displayName: sender.display_name,
                      }
                    : undefined
                }
                receipt={receipts[m.id]}
                myUserId={ME.id}
                nameOf={nameFor}
                onReact={noop}
                onCopy={noop}
                onReply={noop}
                onDelete={noop}
                onRetry={noop}
                onOpenImage={noop}
                onSelect={noop}
              />
            );
          })}
        </ThreadDay>
      ))}
    </div>
  );
}
