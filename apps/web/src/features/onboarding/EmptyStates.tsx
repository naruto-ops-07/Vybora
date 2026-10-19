/**
 * The four illustrated empty states (spec "Your circle, in colour" §2), shared
 * by the workspace and the dev gallery so the copy lives in one place.
 */
import { CheckIcon, MagnifyingGlassIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { CHAT_LIST_EMPTY_COPY, type ChatListEmptyState } from '@vybora/core';
import type { ReactNode } from 'react';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

/** Add a friend: the Friends pane with its username field focused (and prefilled, if given). */
export function AddFriendLink({
  username,
  variant = 'primary',
  size = 'md',
}: {
  username?: string | null;
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md';
}) {
  return (
    <ButtonLink
      to={username ? `/friends?add=${encodeURIComponent(username)}` : '/friends'}
      state={{ focusAddFriend: true }}
      variant={variant}
      size={size}
      className="touch-target"
    >
      Add a friend
    </ButtonLink>
  );
}

function NewMessageButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" className="touch-target" onClick={onClick}>
      New message
    </Button>
  );
}

const SHORTCUTS = [
  ['Ctrl K', 'Command menu'],
  ['Alt N', 'New message'],
  ['/', 'Search chats'],
] as const;

/** Content pane with no chat selected. */
export function WelcomeEmpty({ onCompose, handle }: { onCompose?: () => void; handle: ReactNode }) {
  return (
    <EmptyState
      illustration={<WelcomeIllustration width={208} />}
      title="Pick a chat, or start one"
      body="Messages here are sealed on your device before they’re sent."
      headingLevel={2}
      className="w-full max-w-md px-0"
      action={<AddFriendLink />}
      secondaryAction={onCompose && <NewMessageButton onClick={onCompose} />}
    >
      {handle}
      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
        {SHORTCUTS.map(([k, d]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <kbd className="rounded-sm border border-line-strong px-1.5 font-mono text-[11px] text-ink">
              {k}
            </kbd>
            {d}
          </span>
        ))}
      </p>
    </EmptyState>
  );
}

/** A friend offered as a one-tap avatar in the chat list's say-hi state. */
export interface SayHiFriend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
}

/** At most this many friends are offered as avatars. */
export const SAY_HI_MAX = 5;

/** "Find friends": the Friends pane with its add field focused. */
function FindFriendsLink() {
  return (
    <ButtonLink to="/friends" state={{ focusAddFriend: true }} className="touch-target">
      <MagnifyingGlassIcon size={16} weight="bold" aria-hidden="true" />
      {CHAT_LIST_EMPTY_COPY['no-friends'].action}
    </ButtonLink>
  );
}

/**
 * The chat list with no chats (and no search), by `chatListEmptyState`: a fresh account
 * finds friends or shares its username; requests out say how many are pending; with
 * friends, up to five are one tap from a chat. `loading` stays neutral (no flash of
 * "No friends yet"). `friends: null` (they failed to load) shows say-hi without avatars.
 */
export function ChatListEmptyView({
  state,
  outgoingCount = 0,
  friends,
  pendingId,
  onSayHi,
  onCompose,
  onShare,
  shared,
  shareStatus,
}: {
  state: ChatListEmptyState;
  outgoingCount?: number;
  friends?: SayHiFriend[] | null;
  /** The friend whose chat is being opened. */
  pendingId?: string;
  onSayHi?: (friend: SayHiFriend) => void;
  onCompose: () => void;
  /** Share your username (HandleCard's Share). Omitted until the profile loads. */
  onShare?: () => void;
  /** The share link was just copied. */
  shared?: boolean;
  /** Polite announcement for the share. */
  shareStatus?: string;
}) {
  if (state === 'loading')
    return <div className="min-h-64" aria-hidden="true" data-chat-list-empty="loading" />;

  if (state === 'no-friends') {
    const copy = CHAT_LIST_EMPTY_COPY['no-friends'];
    return (
      <div data-chat-list-empty="no-friends">
        <EmptyState
          illustration={<NoFriendsIllustration width={152} />}
          title={copy.title}
          body={copy.body}
          headingLevel={2}
          className="py-10"
          action={<FindFriendsLink />}
          secondaryAction={
            onShare && (
              <Button
                variant="outline"
                className="touch-target"
                onClick={onShare}
                leftIcon={
                  shared ? (
                    <CheckIcon size={16} weight="bold" aria-hidden="true" />
                  ) : (
                    <ShareNetworkIcon size={16} aria-hidden="true" />
                  )
                }
              >
                {copy.secondaryAction}
              </Button>
            )
          }
        />
        <span className="sr-only" aria-live="polite">
          {shareStatus}
        </span>
      </div>
    );
  }

  if (state === 'waiting') {
    const copy = CHAT_LIST_EMPTY_COPY.waiting;
    return (
      <div data-chat-list-empty="waiting">
        <EmptyState
          illustration={<NoFriendsIllustration width={152} />}
          title={copy.title}
          body={copy.body(outgoingCount)}
          headingLevel={2}
          className="py-10"
          action={<FindFriendsLink />}
        />
      </div>
    );
  }

  const copy = CHAT_LIST_EMPTY_COPY['say-hi'];
  const shown = (friends ?? []).slice(0, SAY_HI_MAX);
  return (
    <div data-chat-list-empty="say-hi">
      <EmptyState
        illustration={<NoChatsIllustration width={152} />}
        title={copy.title}
        body={copy.body}
        headingLevel={2}
        className="py-10"
        action={
          shown.length > 0 && (
            <ul
              className="mb-2 flex basis-full flex-wrap justify-center gap-1"
              aria-label="Friends"
            >
              {shown.map((f) => {
                const name = f.displayName || f.username;
                const pending = pendingId === f.userId;
                return (
                  <li key={f.userId}>
                    <button
                      type="button"
                      aria-label={`Say hi to ${name}`}
                      aria-busy={pending || undefined}
                      disabled={!!pendingId}
                      onClick={() => onSayHi?.(f)}
                      className={cn(
                        'group/hi flex w-[68px] flex-col items-center gap-1.5 rounded-md px-1 pt-1.5 pb-1 transition-colors duration-150',
                        'hover:bg-[color-mix(in_srgb,var(--vy-text)_6%,transparent)] disabled:cursor-default',
                        pendingId && !pending && 'opacity-60',
                      )}
                    >
                      <span className="relative rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface transition-shadow duration-150 group-hover/hi:ring-accent/70 group-focus-visible/hi:ring-accent">
                        <Avatar
                          path={f.avatarPath}
                          name={f.username}
                          userId={f.userId}
                          displayName={f.displayName}
                          username={f.username}
                          size={48}
                          decorative
                        />
                        {pending && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-scrim text-white">
                            <Spinner size={16} />
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-center text-xs font-medium text-muted group-hover/hi:text-ink">
                        {name.split(' ')[0]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        }
        secondaryAction={<NewMessageButton onClick={onCompose} />}
      />
    </div>
  );
}

/** The friends list before the first friend. */
export function FriendsEmpty({ handle }: { handle: ReactNode }) {
  return (
    <EmptyState
      illustration={<NoFriendsIllustration width={160} />}
      title="Your circle starts here"
      body="Share your username or add someone by theirs."
      className="px-4 py-8"
    >
      {handle}
    </EmptyState>
  );
}

/** A people or chat search that found no one. */
export function NoResultsEmpty({
  action,
  headingLevel = 3,
  className,
}: {
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  return (
    <EmptyState
      illustration={<NothingFoundIllustration width={136} />}
      title="No one by that name"
      body="Check the spelling, or add them by username."
      headingLevel={headingLevel}
      className={className ?? 'py-10'}
      action={action}
    />
  );
}
