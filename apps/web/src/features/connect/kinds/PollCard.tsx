import { CheckIcon } from '@phosphor-icons/react';
import { pollTally, pollVotesLabel, toggleVote } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';
import { useMessageKinds } from './context';

const countLabel = (n: number) => (n === 1 ? '1 vote' : `${n} votes`);

/**
 * A poll with live tallies. Tapping an option sends my new choice set; the
 * tally only changes once the server has stored the vote (the engine applies
 * it then), so while it's in flight the poll shows a pending state instead.
 */
export function PollCard({
  message: m,
  myUserId,
  filled,
  nameOf,
}: {
  message: LocalMessage;
  myUserId: string;
  filled: boolean;
  nameOf: (userId: string) => string;
}) {
  const poll = m.poll!;
  const kinds = useMessageKinds();
  const { reduceMotion } = useA11y();
  const tally = pollTally(poll, myUserId);
  const [pending, setPending] = useState<number | null>(null);
  const [votes, setVotes] = useState(false);
  const questionId = useId();
  const list = useRef<HTMLDivElement>(null);

  const choose = async (option: number) => {
    if (pending !== null) return;
    setPending(option);
    try {
      await kinds.onVote(m, toggleVote(poll, tally.myChoices, option));
    } finally {
      setPending(null);
    }
  };
  // Arrow keys move between options (choosing still takes Space or Enter: it sends).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[data-poll-option]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  };

  return (
    <div className="w-[18rem] max-w-full pt-0.5" data-poll="">
      <p id={questionId} className="break-anywhere text-msg font-semibold leading-snug">
        {poll.question}
      </p>
      <p className={cn('mt-0.5 text-xs', !filled && 'text-muted')}>
        {poll.multi ? 'Choose one or more' : 'Choose one'}
      </p>
      <div
        ref={list}
        role={poll.multi ? 'group' : 'radiogroup'}
        aria-labelledby={questionId}
        aria-busy={pending !== null}
        onKeyDown={onKeyDown}
        className="mt-2 space-y-0.5"
      >
        {tally.options.map((o) => {
          const mine = tally.myChoices.includes(o.index);
          const lead = tally.leading.includes(o.index);
          return (
            <button
              key={o.index}
              type="button"
              role={poll.multi ? 'checkbox' : 'radio'}
              aria-checked={mine}
              aria-disabled={pending !== null}
              aria-label={`${o.label}, ${countLabel(o.count)}`}
              data-poll-option=""
              onClick={() => void choose(o.index)}
              className={cn(
                'group/opt -mx-1.5 flex min-h-11 w-[calc(100%+12px)] items-start gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors duration-150',
                filled
                  ? 'hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]'
                  : 'hover:bg-surface-muted',
                pending !== null && 'cursor-wait',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[1.5px]',
                  poll.multi ? 'rounded-[5px]' : 'rounded-full',
                  mine
                    ? filled
                      ? 'border-current bg-current'
                      : 'border-accent bg-accent text-on-accent'
                    : filled
                      ? 'border-current'
                      : 'border-line-strong',
                )}
                aria-hidden="true"
              >
                {pending === o.index ? (
                  <Spinner size={12} className={cn(mine && filled && 'invert')} />
                ) : (
                  mine &&
                  (poll.multi ? (
                    <CheckIcon size={12} weight="bold" className={filled ? 'invert' : ''} />
                  ) : (
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        filled ? 'bg-[var(--vy-bubble-out-to)]' : 'bg-on-accent',
                      )}
                    />
                  ))
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="break-anywhere min-w-0 flex-1 text-sm leading-snug">
                    {o.label}
                  </span>
                  <span
                    className={cn('shrink-0 font-mono text-xs', lead && 'font-semibold')}
                    aria-hidden="true"
                  >
                    {o.count}
                  </span>
                </span>
                {/* The share of voters: a hairline track that fills from the start. */}
                <span
                  className={cn(
                    'mt-1.5 block h-1 overflow-hidden rounded-full',
                    filled
                      ? 'bg-[color-mix(in_srgb,currentColor_22%,transparent)]'
                      : 'bg-surface-strong',
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      filled ? 'bg-current' : 'bg-accent',
                      !reduceMotion && 'transition-[width] duration-300 ease-out',
                    )}
                    style={{ width: `${Math.round(o.share * 100)}%` }}
                    data-poll-share={Math.round(o.share * 100)}
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex min-h-8 items-center justify-between gap-3 text-xs">
        <span className={cn(!filled && 'text-muted')}>{pollVotesLabel(tally.totalVoters)}</span>
        {kinds.isGroup && tally.totalVoters > 0 && (
          <button
            type="button"
            onClick={() => setVotes(true)}
            className={cn(
              'touch-target -mr-1 rounded-sm px-1 py-1 font-semibold underline-offset-2 hover:underline',
              !filled && 'text-accent',
            )}
          >
            View votes
          </button>
        )}
      </div>
      <Dialog
        open={votes}
        onClose={() => setVotes(false)}
        title={poll.question}
        description={pollVotesLabel(tally.totalVoters)}
      >
        <div className="space-y-5">
          {tally.options.map((o) => (
            <section key={o.index} aria-label={o.label}>
              <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                <span className="break-anywhere">{o.label}</span>
                <span className="shrink-0 text-xs font-normal text-muted">
                  {countLabel(o.count)}
                </span>
              </h3>
              {o.voters.length ? (
                <ul className="mt-2 space-y-1">
                  {o.voters.map((id) => (
                    <li key={id} className="flex min-h-10 items-center gap-3 text-sm">
                      <Avatar path={null} name={nameOf(id)} userId={id} size={28} decorative />
                      {nameOf(id)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">No votes</p>
              )}
            </section>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
