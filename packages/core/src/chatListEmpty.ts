/**
 * The chat list with no chats yet. Which empty state shows depends on whether the
 * person has friends; web InboxPane and the mobile inbox share this rule.
 */

export type ChatListEmptyState = 'loading' | 'no-friends' | 'waiting' | 'say-hi';

export interface ChatListEmptyInput {
  /** The friends query has settled. */
  friendsLoaded: boolean;
  friendCount: number;
  /** Friend requests I sent that are still pending. */
  outgoingCount: number;
}

/**
 * - `loading`: stay neutral until friends load (no flash of "No friends yet").
 * - `no-friends`: a fresh account, no friends and nothing sent.
 * - `waiting`: no friends yet, but requests sent.
 * - `say-hi`: at least one friend.
 *
 * If the friends query fails, callers show `say-hi` copy without the friend avatars.
 */
export function chatListEmptyState({
  friendsLoaded,
  friendCount,
  outgoingCount,
}: ChatListEmptyInput): ChatListEmptyState {
  if (!friendsLoaded) return 'loading';
  if (friendCount > 0) return 'say-hi';
  if (outgoingCount > 0) return 'waiting';
  return 'no-friends';
}

/** Copy per state; `action` is the primary button, `secondaryAction` the second. */
export const CHAT_LIST_EMPTY_COPY = {
  'no-friends': {
    title: 'No friends yet',
    body: 'Find your friends by their username and start chatting.',
    action: 'Find friends',
    secondaryAction: 'Share your username',
  },
  waiting: {
    title: 'No friends yet',
    /** `outgoingCount` requests: "Waiting on 1 request. …" / "Waiting on 2 requests. …" */
    body: (outgoingCount: number) =>
      `Waiting on ${outgoingCount} ${outgoingCount === 1 ? 'request' : 'requests'}. Find more friends while you wait.`,
    action: 'Find friends',
  },
  'say-hi': {
    title: 'No chats yet',
    body: 'Say hi to a friend.',
    action: 'New message',
  },
} as const;
