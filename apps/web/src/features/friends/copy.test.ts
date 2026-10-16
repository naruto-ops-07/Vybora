import { describe, expect, it } from 'vitest';
import {
  addFriendErrorNotice,
  addFriendResultNotice,
  friendRequestsLabel,
  normalizeUsername,
} from './copy';

describe('normalizeUsername', () => {
  it('trims, drops one leading @ and lower-cases', () => {
    expect(normalizeUsername('  @Maya.Rose ')).toBe('maya.rose');
    expect(normalizeUsername('maya')).toBe('maya');
    expect(normalizeUsername('@')).toBe('');
    expect(normalizeUsername('   ')).toBe('');
  });
});

describe('add friend result messages', () => {
  it.each([
    ['sent', 'success', 'Request sent to @maya'],
    ['accepted', 'success', 'You and @maya are now friends'],
    ['already_friends', 'info', 'You’re already friends with @maya'],
    ['already_sent', 'info', 'You already sent @maya a request. It’s still pending.'],
  ] as const)('%s', (result, tone, text) => {
    expect(addFriendResultNotice(result, 'maya')).toEqual({ tone, text });
  });
});

describe('add friend error messages', () => {
  const err = (message: string) => ({ message, code: 'P0001' });

  it('never hints at blocks: unknown, inactive and blocked all read the same', () => {
    expect(addFriendErrorNotice(err('user_not_found'))).toEqual({
      tone: 'error',
      text: 'No one with that username. Check the spelling and try again.',
    });
  });

  it.each([
    ['cannot_add_self', 'That’s your own username. Enter a friend’s instead.'],
    ['too_many_requests', 'You have too many pending requests. Cancel some before sending more.'],
    ['not_authenticated', 'Your session has ended. Sign in again to add friends.'],
  ])('%s', (code, text) => {
    expect(addFriendErrorNotice(err(code))).toEqual({ tone: 'error', text });
  });

  it('falls back to a friendly network message', () => {
    expect(addFriendErrorNotice(new TypeError('Failed to fetch')).text).toMatch(/offline/i);
  });
});

describe('friendRequestsLabel', () => {
  it('pluralises for screen readers', () => {
    expect(friendRequestsLabel(1)).toBe('1 friend request');
    expect(friendRequestsLabel(3)).toBe('3 friend requests');
    expect(friendRequestsLabel(140)).toBe('140 friend requests');
  });
});
