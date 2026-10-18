import {
  cancelFriendRequest,
  createSecureConversation,
  fetchFriendRequests,
  fetchFriends,
  peerOf,
  qk,
  removeFriend,
  respondFriendRequest,
  type Friend,
  type FriendRequest,
  type SecureConversation,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { logDevError } from '@/lib/devLog';

type Requests = Awaited<ReturnType<typeof fetchFriendRequests>>;
type Person = Pick<Friend, 'userId' | 'username' | 'displayName'>;

/** How a person is named in copy: display name, else @username. */
export const nameOf = (p: Person) => p.displayName || `@${p.username}`;

export function useFriends() {
  return useQuery({ queryKey: qk.connect.friends, queryFn: () => fetchFriends(supabase) });
}

/**
 * Pending requests both ways. No push for friend requests yet, so this polls
 * every 30 s (while the tab is visible) and on every return to the tab; the
 * nav badge and the Friends pane share it.
 */
export function useFriendRequests() {
  return useQuery({
    queryKey: qk.connect.friendRequests,
    queryFn: () => fetchFriendRequests(supabase),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
}

const byName = (a: Friend, b: Friend) =>
  (a.displayName || a.username).localeCompare(b.displayName || b.username);
const byNewest = (a: FriendRequest, b: FriendRequest) =>
  (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

function editRequests(qc: QueryClient, edit: (r: Requests) => Requests) {
  qc.setQueryData<Requests>(qk.connect.friendRequests, (r) => (r ? edit(r) : r));
}
function editFriends(qc: QueryClient, edit: (f: Friend[]) => Friend[]) {
  qc.setQueryData<Friend[]>(qk.connect.friends, (f) => (f ? edit(f) : f));
}
const without = <T extends { userId: string }>(list: T[], id: string) =>
  list.filter((x) => x.userId !== id);

const isGone = (e: unknown) =>
  String((e as { message?: unknown } | null)?.message ?? '').includes('request_not_found');
const retryHint = 'Check your connection and try again.';

/**
 * Accept, decline, cancel and remove, each applied to the cache at once and
 * undone item by item on failure (so two quick actions never undo each other).
 * `onAccepted` replaces the "now friends" toast (the Friends pane shows a card).
 */
export function useFriendActions({
  onAccepted,
}: { onAccepted?: (request: FriendRequest) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: qk.connect.friendRequests });
    void qc.invalidateQueries({ queryKey: qk.connect.friends });
  };
  const pause = () =>
    Promise.all([
      qc.cancelQueries({ queryKey: qk.connect.friendRequests }),
      qc.cancelQueries({ queryKey: qk.connect.friends }),
    ]);

  const respond = useMutation({
    mutationFn: ({ request, accept }: { request: FriendRequest; accept: boolean }) =>
      respondFriendRequest(supabase, request.userId, accept),
    onMutate: async ({ request, accept }) => {
      await pause();
      editRequests(qc, (r) => ({ ...r, incoming: without(r.incoming, request.userId) }));
      if (accept)
        editFriends(qc, (f) =>
          [...without(f, request.userId), { ...request, since: new Date().toISOString() }].sort(
            byName,
          ),
        );
    },
    onError: (e, { request, accept }) => {
      if (accept) editFriends(qc, (f) => without(f, request.userId));
      if (isGone(e)) {
        toast.show('That request is no longer available.', 'info');
        return;
      }
      editRequests(qc, (r) => ({
        ...r,
        incoming: [...without(r.incoming, request.userId), request].sort(byNewest),
      }));
      toast.show(
        `Couldn’t ${accept ? 'accept' : 'decline'} ${nameOf(request)}’s request. ${retryHint}`,
        'error',
      );
    },
    onSuccess: (_, { request, accept }) => {
      if (!accept) return;
      if (onAccepted) onAccepted(request);
      else toast.show(`You and ${nameOf(request)} are now friends`, 'success');
    },
    onSettled: settle,
  });

  const cancel = useMutation({
    mutationFn: (request: FriendRequest) => cancelFriendRequest(supabase, request.userId),
    onMutate: async (request) => {
      await pause();
      editRequests(qc, (r) => ({ ...r, outgoing: without(r.outgoing, request.userId) }));
    },
    onError: (_, request) => {
      editRequests(qc, (r) => ({
        ...r,
        outgoing: [...without(r.outgoing, request.userId), request].sort(byNewest),
      }));
      toast.show(`Couldn’t cancel your request to ${nameOf(request)}. ${retryHint}`, 'error');
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (friend: Friend) => removeFriend(supabase, friend.userId),
    onMutate: async (friend) => {
      await pause();
      editFriends(qc, (f) => without(f, friend.userId));
    },
    onError: (_, friend) => {
      editFriends(qc, (f) => [...without(f, friend.userId), friend].sort(byName));
      toast.show(`Couldn’t remove ${nameOf(friend)}. ${retryHint}`, 'error');
    },
    onSuccess: (_, friend) => toast.show(`Removed ${nameOf(friend)} from friends`, 'success'),
    onSettled: settle,
  });

  return { respond, cancel, remove };
}

/**
 * Open the direct chat with a friend: reuse one already in the inbox cache,
 * otherwise create it (the server also dedupes direct chats).
 */
export function useMessageFriend() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId } = useMe();
  const create = useMutation({
    mutationFn: (friend: Friend) => createSecureConversation(supabase, 'direct', [friend.userId]),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      navigate(`/messages/${id}`);
    },
    onError: (e, friend) => {
      logDevError('start chat', e);
      toast.show(
        String((e as { message?: unknown }).message ?? '').includes('cannot_message')
          ? `You can’t message ${nameOf(friend)} right now.`
          : friendlyError(e),
        'error',
      );
    },
  });
  const open = (friend: Friend) => {
    const existing = qc
      .getQueryData<SecureConversation[]>(qk.connect.inbox)
      ?.find((c) => c.kind === 'direct' && peerOf(c, userId)?.id === friend.userId);
    if (existing) navigate(`/messages/${existing.id}`);
    else create.mutate(friend);
  };
  return { open, pendingId: create.isPending ? create.variables?.userId : undefined };
}
