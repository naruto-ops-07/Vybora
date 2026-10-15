import {
  block,
  createSecureConversation,
  follow,
  mute,
  qk,
  unblock,
  unfollow,
  unmute,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { ProfileView } from '@vybora/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

/** Relationship actions for a profile; the server is the source of truth, so we refetch after each. */
export function useRelationship(profile: ProfileView) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const key = qk.profile(profile.username);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: qk.feed.home });
    void qc.invalidateQueries({ queryKey: qk.stories.tray });
  };
  const onError = (e: unknown) => toast.show(friendlyError(e), 'error');

  const followMut = useMutation({
    mutationFn: () => follow(supabase, userId!, profile.id),
    onMutate: () => {
      const prev = qc.getQueryData<ProfileView>(key);
      qc.setQueryData<ProfileView>(key, (p) =>
        p
          ? {
              ...p,
              follow_status: p.is_private ? 'pending' : 'accepted',
              followers_count: p.followers_count + (p.is_private ? 0 : 1),
            }
          : p,
      );
      return prev;
    },
    onError: (e, _v, prev) => {
      qc.setQueryData(key, prev);
      onError(e);
    },
    onSettled: refresh,
  });

  const unfollowMut = useMutation({
    mutationFn: () => unfollow(supabase, userId!, profile.id),
    onMutate: () => {
      const prev = qc.getQueryData<ProfileView>(key);
      qc.setQueryData<ProfileView>(key, (p) =>
        p
          ? {
              ...p,
              follow_status: null,
              followers_count: Math.max(
                0,
                p.followers_count - (p.follow_status === 'accepted' ? 1 : 0),
              ),
            }
          : p,
      );
      return prev;
    },
    onError: (e, _v, prev) => {
      qc.setQueryData(key, prev);
      onError(e);
    },
    onSettled: refresh,
  });

  const blockMut = useMutation({
    mutationFn: (on: boolean) =>
      on ? block(supabase, userId!, profile.id) : unblock(supabase, userId!, profile.id),
    onSuccess: (_d, on) => {
      toast.show(on ? `Blocked @${profile.username}` : `Unblocked @${profile.username}`, 'success');
      void qc.invalidateQueries({ queryKey: qk.blocked });
      void qc.invalidateQueries({ queryKey: qk.feed.all });
      refresh();
    },
    onError,
  });

  const muteMut = useMutation({
    mutationFn: (on: boolean) =>
      on ? mute(supabase, userId!, profile.id) : unmute(supabase, userId!, profile.id),
    onSuccess: (_d, on) => {
      toast.show(
        on
          ? `Muted @${profile.username}. You’ll still follow them.`
          : `Unmuted @${profile.username}`,
        'success',
      );
      void qc.invalidateQueries({ queryKey: qk.feed.all });
      refresh();
    },
    onError,
  });

  const message = useMutation({
    mutationFn: () => createSecureConversation(supabase, 'direct', [profile.id]),
    onSuccess: (id) => navigate(`/messages/${id}`),
    onError,
  });

  return { followMut, unfollowMut, blockMut, muteMut, message };
}
