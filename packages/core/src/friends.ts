import { friendlyError } from './errors';

/**
 * What the server did with a username-based friend request. The single source
 * of truth: `@vybora/api` re-exports this type.
 */
export type FriendRequestResult = 'sent' | 'accepted' | 'already_friends' | 'already_sent';

/** What a person typed → the username the server matches (case-insensitive, `@` optional). */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').trim().toLowerCase();
}

export interface AddFriendNotice {
  tone: 'success' | 'info' | 'error';
  text: string;
}

export function addFriendResultNotice(
  result: FriendRequestResult,
  username: string,
): AddFriendNotice {
  const at = `@${username}`;
  switch (result) {
    case 'sent':
      return { tone: 'success', text: `Request sent to ${at}` };
    case 'accepted':
      return { tone: 'success', text: `You and ${at} are now friends` };
    case 'already_friends':
      return { tone: 'info', text: `You’re already friends with ${at}` };
    case 'already_sent':
      return { tone: 'info', text: `You already sent ${at} a request. It’s still pending.` };
  }
}

// Unknown, inactive and blocked accounts share one message on purpose: it must
// never reveal whether a username exists or who blocked whom.
const ERRORS: Record<string, string> = {
  user_not_found: 'No one with that username. Check the spelling and try again.',
  cannot_add_self: 'That’s your own username. Enter a friend’s instead.',
  too_many_requests: 'You have too many pending requests. Cancel some before sending more.',
  not_authenticated: 'Your session has ended. Sign in again to add friends.',
};

export function addFriendErrorNotice(error: unknown): AddFriendNotice {
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  const known = Object.keys(ERRORS).find((code) => message.includes(code));
  return { tone: 'error', text: known ? ERRORS[known]! : friendlyError(error) };
}

/** Screen-reader text for the Friends nav badge. */
export function friendRequestsLabel(n: number): string {
  return `${n} friend request${n === 1 ? '' : 's'}`;
}
