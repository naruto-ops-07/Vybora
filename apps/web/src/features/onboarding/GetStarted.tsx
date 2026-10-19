import { CheckCircleIcon, CircleIcon, XIcon } from '@phosphor-icons/react';
import {
  GET_STARTED_STEPS,
  getStartedProgress,
  type GetStartedProgress,
  type GetStartedStep,
} from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useMe } from '@/features/auth/AuthProvider';
import { useSecureInbox } from '@/features/connect/hooks';
import { HandleCard } from '@/features/friends/HandleCard';
import { useFriendRequests, useFriends } from '@/features/friends/hooks';
import { cn } from '@/lib/cn';
import { allSetThisSession, useOnboarding } from './store';

const LABEL: Record<GetStartedStep, string> = {
  share: 'Share your username',
  friend: 'Add a friend',
  hi: 'Say hi',
};
const HINT: Record<GetStartedStep, string> = {
  share: 'Friends add you by it. Send it wherever you already talk.',
  friend: 'Ask for their exact username and send a request.',
  hi: 'Start a chat. It’s sealed on your device before it’s sent.',
};

export interface GetStartedViewProps {
  progress: GetStartedProgress;
  /** The @handle row for step 1 (HandleCard compact). */
  handle: ReactNode;
  /** Shown in the all-set state. */
  username?: string;
  onSayHi: () => void;
  onDismiss: () => void;
}

/**
 * The first-run panel at the top of the chat list: three steps with check
 * states (icon and "Done" text, never colour alone), "N of 3", a dismiss
 * button, and a one-time "You're all set" when everything is done.
 */
export function GetStartedView({
  progress,
  handle,
  username,
  onSayHi,
  onDismiss,
}: GetStartedViewProps) {
  const titleId = useId();
  const { steps, done, complete } = progress;
  const dismiss = (
    <Button
      size="icon-sm"
      variant="ghost"
      className="touch-target -mr-1 -mt-1 text-muted"
      aria-label="Hide getting started"
      onClick={onDismiss}
    >
      <XIcon size={16} aria-hidden="true" />
    </Button>
  );

  if (complete)
    return (
      <section
        aria-labelledby={titleId}
        className="m-3 flex items-start gap-3 vy-card rounded-lg p-3.5"
        data-get-started="done"
      >
        <CheckCircleIcon
          size={22}
          weight="fill"
          className="mt-px shrink-0 text-accent"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1" role="status">
          <h2 id={titleId} className="type-wide text-[15px]">
            You’re all set
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {username
              ? `Friends can add you any time as @${username}.`
              : 'Friends can add you any time by your username.'}
          </p>
        </div>
        {dismiss}
      </section>
    );

  const action: Record<GetStartedStep, ReactNode> = {
    share: handle,
    friend: (
      <ButtonLink
        to="/friends"
        state={{ focusAddFriend: true }}
        size="sm"
        variant="outline"
        className="touch-target"
      >
        Add by username
      </ButtonLink>
    ),
    hi: (
      <Button size="sm" variant="outline" className="touch-target" onClick={onSayHi}>
        New message
      </Button>
    ),
  };

  return (
    <section
      aria-labelledby={titleId}
      className="m-3 vy-card rounded-lg p-3.5"
      data-get-started="steps"
    >
      <div className="flex items-start gap-3">
        <h2 id={titleId} className="type-wide flex-1 text-[15px]">
          Get started
        </h2>
        <span className="mt-0.5 font-mono text-xs text-muted" aria-live="polite">
          {done} of 3<span className="sr-only"> steps done</span>
        </span>
        {dismiss}
      </div>
      {/* Three flat segments: a glance at progress. The text above carries it for screen readers. */}
      <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden="true">
        {GET_STARTED_STEPS.map((s) => (
          <span
            key={s}
            className={cn('h-1 rounded-full', steps[s] ? 'bg-accent' : 'bg-surface-strong')}
          />
        ))}
      </div>
      <ol className="mt-1">
        {GET_STARTED_STEPS.map((s) => {
          const ok = steps[s];
          return (
            <li
              key={s}
              className="flex gap-3 border-b border-line py-3 last:border-b-0 last:pb-0.5"
            >
              {ok ? (
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  className="shrink-0 text-accent"
                  aria-hidden="true"
                />
              ) : (
                <CircleIcon size={20} className="shrink-0 text-subtle" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium leading-5', ok && 'text-muted')}>
                  {LABEL[s]}
                  {ok && <span className="sr-only">. Done</span>}
                </p>
                {!ok && (
                  <>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{HINT[s]}</p>
                    <div className="mt-2.5">{action[s]}</div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Get started for the signed-in user: steps from friends, requests and the
 * latest message per chat; the record (shared / dismissed / done) is per
 * device per user. Hidden while data loads so it never flashes 0 of 3.
 */
export function GetStarted({
  previews,
  previewsReady,
  onSayHi,
  onDismissed,
}: {
  /** Latest decrypted message per chat (the inbox's previews). */
  previews: Record<string, LocalMessage | undefined> | undefined;
  previewsReady: boolean;
  onSayHi: () => void;
  /** After hiding: move focus somewhere sensible. */
  onDismissed?: () => void;
}) {
  const { userId, profile } = useMe();
  const [record, update] = useOnboarding(userId);
  const friends = useFriends();
  const requests = useFriendRequests();
  const inbox = useSecureInbox();
  const ready = friends.isSuccess && requests.isSuccess && inbox.isSuccess && previewsReady;

  const progress = useMemo(
    () =>
      getStartedProgress({
        record,
        friendCount: friends.data?.length ?? 0,
        outgoingCount: requests.data?.outgoing.length ?? 0,
        lastSenderIds: Object.values(previews ?? {}).map((m) => m?.senderId),
        myUserId: userId,
      }),
    [record, friends.data, requests.data, previews, userId],
  );
  // Steps once seen stay done; 3 of 3 shows "You're all set" for this session only.
  const completeNow = ready && progress.complete;
  useEffect(() => {
    if (!ready) return;
    const patch: Parameters<typeof update>[0] = {};
    if (progress.steps.friend && !record.friend) patch.friend = true;
    if (progress.steps.hi && !record.saidHi) patch.saidHi = true;
    if (progress.complete && !record.done) {
      patch.done = true;
      allSetThisSession.add(userId);
    }
    if (Object.keys(patch).length) update(patch);
  }, [ready, progress, record, update, userId]);

  if (!ready || record.dismissed) return null;
  if (record.done && !allSetThisSession.has(userId)) return null;
  return (
    <GetStartedView
      progress={completeNow || record.done ? { ...progress, complete: true } : progress}
      handle={<HandleCard variant="compact" />}
      username={profile?.username}
      onSayHi={onSayHi}
      onDismiss={() => {
        update({ dismissed: true });
        onDismissed?.();
      }}
    />
  );
}
