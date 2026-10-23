import { fetchMyProfile } from '@vybora/api';
import { useMutationState, useQuery } from '@tanstack/react-query';
import { useMe } from '@/features/auth/AuthProvider';
import { useFriendRequests, useFriends } from '@/features/friends/hooks';
import { supabase } from '@/lib/supabase';
import type { ContactProfile, ContactState } from './context';

/** The "Add friend" mutation from contact cards (its variables are the ContactProfile). */
export const ADD_FRIEND_KEY = ['connect', 'contact-add-friend'] as const;

/** The server's profile for a user id (null when there is none we may see). */
export function contactProfileQuery(userId: string) {
  return {
    queryKey: ['connect', 'contact-profile', userId] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ContactProfile | null> => {
      // A by-id read of `profiles`, under its RLS: suspended accounts and people
      // who blocked me come back as no row, exactly like an unknown id.
      const r = await fetchMyProfile(supabase, userId).catch(() => null);
      if (!r || r.status !== 'active') return null;
      return {
        id: r.id,
        username: r.username,
        displayName: r.display_name || null,
        avatarPath: r.avatar_path,
      };
    },
  };
}

/**
 * A contact card's person, from the server only (the card's own name and
 * username are never used), plus how they relate to me.
 */
export function useServerContact(userId: string): ContactState {
  const { userId: me } = useMe();
  const profile = useQuery(contactProfileQuery(userId));
  const friends = useFriends();
  const requests = useFriendRequests();
  const adding = useMutationState({
    filters: { mutationKey: ADD_FRIEND_KEY, status: 'pending' },
    select: (m) => (m.state.variables as ContactProfile | undefined)?.id,
  }).includes(userId);

  if (profile.isPending) return { status: 'loading' };
  if (!profile.data) return { status: 'missing' };
  const p = profile.data;
  if (p.id === me) return { status: 'found', profile: p, relation: 'self' };
  // Wait for friendship state so "Add friend" never flashes for a friend.
  if (friends.isPending || requests.isPending) return { status: 'loading' };
  const relation = friends.data?.some((f) => f.userId === p.id)
    ? 'friends'
    : requests.data?.outgoing.some((r) => r.userId === p.id)
      ? 'outgoing'
      : requests.data?.incoming.some((r) => r.userId === p.id)
        ? 'incoming'
        : 'none';
  return { status: 'found', profile: p, relation, adding };
}
