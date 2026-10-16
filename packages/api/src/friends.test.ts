import type { FriendRequestResult as CoreFriendRequestResult } from '@vybora/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  cancelFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  type FriendRequestResult,
} from './friends';
import { qk } from './keys';
import type { VyboraClient } from './client';

const clientWith = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as VyboraClient;

describe('friends API', () => {
  it('sends a request by username and returns the server status', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'accepted', error: null });
    expect(await sendFriendRequest(clientWith(rpc), '@Ada')).toBe('accepted');
    expect(rpc).toHaveBeenCalledWith('send_friend_request', { p_username: '@Ada' });
  });

  it('uses the request result type defined once in core', () => {
    expectTypeOf<FriendRequestResult>().toEqualTypeOf<CoreFriendRequestResult>();
    expectTypeOf(sendFriendRequest).returns.resolves.toEqualTypeOf<CoreFriendRequestResult>();
  });

  it('passes server errors through as thrown values', async () => {
    const error = { message: 'user_not_found', code: 'P0002' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(sendFriendRequest(clientWith(rpc), 'nobody')).rejects.toBe(error);
    await expect(respondFriendRequest(clientWith(rpc), 'u1', true)).rejects.toBe(error);
    await expect(cancelFriendRequest(clientWith(rpc), 'u1')).rejects.toBe(error);
    await expect(removeFriend(clientWith(rpc), 'u1')).rejects.toBe(error);
    await expect(fetchFriends(clientWith(rpc))).rejects.toBe(error);
    await expect(fetchFriendRequests(clientWith(rpc))).rejects.toBe(error);
  });

  it('responds, cancels and removes through their RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = clientWith(rpc);
    await respondFriendRequest(client, 'u1', false);
    await cancelFriendRequest(client, 'u2');
    await removeFriend(client, 'u3');
    expect(rpc).toHaveBeenNthCalledWith(1, 'respond_friend_request', {
      p_requester: 'u1',
      p_accept: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_friend_request', { p_addressee: 'u2' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'remove_friend', { p_friend: 'u3' });
  });

  it('maps friends rows to camelCase', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          username: 'ada',
          display_name: 'Ada',
          avatar_path: 'a/b.jpg',
          since: '2026-10-16T10:00:00+00:00',
        },
        { user_id: 'u2', username: 'bob', display_name: null, avatar_path: null, since: null },
      ],
      error: null,
    });
    expect(await fetchFriends(clientWith(rpc))).toEqual([
      {
        userId: 'u1',
        username: 'ada',
        displayName: 'Ada',
        avatarPath: 'a/b.jpg',
        since: '2026-10-16T10:00:00+00:00',
      },
      { userId: 'u2', username: 'bob', displayName: null, avatarPath: null, since: null },
    ]);
    expect(rpc).toHaveBeenCalledWith('my_friends');
  });

  it('splits requests into incoming and outgoing, keeping server order', async () => {
    const row = (direction: string, id: string) => ({
      direction,
      user_id: id,
      username: id,
      display_name: id.toUpperCase(),
      avatar_path: null,
      created_at: '2026-10-16T10:00:00+00:00',
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [row('incoming', 'a'), row('outgoing', 'b'), row('incoming', 'c')],
      error: null,
    });
    const { incoming, outgoing } = await fetchFriendRequests(clientWith(rpc));
    expect(incoming.map((r) => r.userId)).toEqual(['a', 'c']);
    expect(outgoing.map((r) => r.userId)).toEqual(['b']);
    expect(incoming[0]).toEqual({
      userId: 'a',
      username: 'a',
      displayName: 'A',
      avatarPath: null,
      createdAt: '2026-10-16T10:00:00+00:00',
    });
    expect(rpc).toHaveBeenCalledWith('my_friend_requests');
  });

  it('has stable query keys', () => {
    expect(qk.connect.friends).toEqual(['connect', 'friends']);
    expect(qk.connect.friendRequests).toEqual(['connect', 'friend-requests']);
  });
});
