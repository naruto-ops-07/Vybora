import { unwrap, type VyboraClient } from './client';

/** What the server did with a username-based request. */
export type FriendRequestResult = 'sent' | 'accepted' | 'already_friends' | 'already_sent';

export interface Friend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  since: string | null;
}

export interface FriendRequest {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  createdAt: string | null;
}

/**
 * Ask someone to be friends by exact username (case-insensitive, leading `@`
 * optional). If they already asked me, this accepts. Throws the server error
 * (`user_not_found`, `cannot_add_self`, `too_many_requests`, ...); unknown,
 * inactive and blocked users are deliberately indistinguishable.
 */
export async function sendFriendRequest(
  client: VyboraClient,
  username: string,
): Promise<FriendRequestResult> {
  return unwrap(
    await client.rpc('send_friend_request', { p_username: username }),
  ) as FriendRequestResult;
}

export async function respondFriendRequest(
  client: VyboraClient,
  requesterId: string,
  accept: boolean,
): Promise<void> {
  unwrap(
    await client.rpc('respond_friend_request', { p_requester: requesterId, p_accept: accept }),
  );
}

export async function cancelFriendRequest(
  client: VyboraClient,
  addresseeId: string,
): Promise<void> {
  unwrap(await client.rpc('cancel_friend_request', { p_addressee: addresseeId }));
}

export async function removeFriend(client: VyboraClient, friendId: string): Promise<void> {
  unwrap(await client.rpc('remove_friend', { p_friend: friendId }));
}

export async function fetchFriends(client: VyboraClient): Promise<Friend[]> {
  const rows = unwrap(await client.rpc('my_friends'));
  return rows.map((r) => ({
    userId: r.user_id!,
    username: r.username!,
    displayName: r.display_name,
    avatarPath: r.avatar_path,
    since: r.since,
  }));
}

export async function fetchFriendRequests(
  client: VyboraClient,
): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const rows = unwrap(await client.rpc('my_friend_requests'));
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];
  for (const r of rows) {
    const request: FriendRequest = {
      userId: r.user_id!,
      username: r.username!,
      displayName: r.display_name,
      avatarPath: r.avatar_path,
      createdAt: r.created_at,
    };
    (r.direction === 'incoming' ? incoming : outgoing).push(request);
  }
  return { incoming, outgoing };
}
