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
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useMe } from '@/features/auth/AuthProvider';
import { useHaptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { logDevError } from '@/lib/devLog';

type Requests = Awaited<ReturnType<typeof fetchFriendRequests>>;
type Person = Pick<Friend, 'username' | 'displayName'>;

/** How a person is named in copy: display name, else the username. */
export const nameOf = (p: Person) => p.displayName || p.username;

export function useFriends() {
  return useQuery({ queryKey: qk.connect.friends, queryFn: () => fetchFriends(supabase) });
}

/**
 * Pending requests both ways. There is no push for friend requests yet, so
 * this polls every 30 s while the screen is focused and refetches whenever the
 * app returns to the foreground (the root layout feeds AppState to React
 * Query's focus manager). The inbox badge and the Friends screen share it.
 */
export function useFriendRequests(focused = true) {
  return useQuery({
    queryKey: qk.connect.friendRequests,
    queryFn: () => fetchFriendRequests(supabase),
    staleTime: 0,
    refetchInterval: focused ? 30_000 : false,
    refetchOnWindowFocus: 'always',
  });
}

const byName = (a: Friend, b: Friend) => nameOf(a).localeCompare(nameOf(b));
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
 * Failures surface as an Alert, since the row has already disappeared.
 */
export function useFriendActions() {
  const qc = useQueryClient();
  const haptic = useHaptics();
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
        Alert.alert('Request no longer available', 'They may have cancelled it.');
        return;
      }
      editRequests(qc, (r) => ({
        ...r,
        incoming: [...without(r.incoming, request.userId), request].sort(byNewest),
      }));
      Alert.alert(
        `Couldn’t ${accept ? 'accept' : 'decline'} ${nameOf(request)}’s request`,
        retryHint,
      );
    },
    onSuccess: (_, { accept }) => {
      // Friendship joined: the medium tap, once.
      if (accept) haptic('medium');
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
      Alert.alert(`Couldn’t cancel your request to ${nameOf(request)}`, retryHint);
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
      Alert.alert(`Couldn’t remove ${nameOf(friend)}`, retryHint);
    },
    onSettled: settle,
  });

  return { respond, cancel, remove };
}

const openChat = (id: string) => router.push({ pathname: '/messages/[id]', params: { id } });

/**
 * Open the direct chat with a friend: reuse one already in the inbox cache,
 * otherwise create it (the server also dedupes direct chats).
 */
export function useMessageFriend() {
  const qc = useQueryClient();
  const { userId } = useMe();
  const create = useMutation({
    mutationFn: (friend: Friend) => createSecureConversation(supabase, 'direct', [friend.userId]),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      openChat(id);
    },
    onError: (e, friend) => {
      logDevError('start chat', e);
      Alert.alert(
        'Couldn’t start chat',
        String((e as { message?: unknown } | null)?.message ?? '').includes('cannot_message')
          ? `You can’t message ${nameOf(friend)} right now.`
          : friendlyError(e),
      );
    },
  });
  const open = (friend: Friend) => {
    if (create.isPending) return;
    const existing = qc
      .getQueryData<SecureConversation[]>(qk.connect.inbox)
      ?.find((c) => c.kind === 'direct' && peerOf(c, userId)?.id === friend.userId);
    if (existing) openChat(existing.id);
    else create.mutate(friend);
  };
  return { open, pendingId: create.isPending ? create.variables?.userId : undefined };
}
