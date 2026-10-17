/**
 * The four illustrated empty states (spec "Your circle, in colour" §2), shared
 * by the workspace and the dev gallery so the copy lives in one place.
 */
import type { ReactNode } from 'react';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

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

/** The chat list before the first chat. */
export function NoChatsEmpty({ onCompose }: { onCompose: () => void }) {
  return (
    <EmptyState
      illustration={<NoChatsIllustration width={160} />}
      title="No chats yet"
      body="Add a friend by their username, then say hi."
      headingLevel={2}
      className="py-10"
      action={<AddFriendLink />}
      secondaryAction={<NewMessageButton onClick={onCompose} />}
    />
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
