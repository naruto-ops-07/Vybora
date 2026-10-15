import { deletePost, qk, setLiked, setSaved, updatePost } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { restoreSnapshot, updatePostEverywhere } from './postCache';

/** Optimistic like/save with rollback on failure; edit and delete invalidate feeds. */
export function usePostActions(post: PostCard) {
  const qc = useQueryClient();
  const toast = useToast();
  const { userId } = useAuth();

  const like = useMutation({
    mutationFn: (liked: boolean) => setLiked(supabase, userId!, post.id, liked),
    onMutate: async (liked) => {
      await qc.cancelQueries({ queryKey: ['feed'] });
      return updatePostEverywhere(qc, post.id, (p) =>
        p.liked_by_me === liked
          ? p
          : { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) },
      );
    },
    onError: (error, _liked, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      toast.show(friendlyError(error), 'error');
    },
  });

  const save = useMutation({
    mutationFn: (saved: boolean) => setSaved(supabase, userId!, post.id, saved),
    onMutate: async (saved) =>
      updatePostEverywhere(qc, post.id, (p) => ({ ...p, saved_by_me: saved })),
    onError: (error, _saved, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      toast.show(friendlyError(error), 'error');
    },
    onSuccess: (_d, saved) => {
      toast.show(saved ? 'Saved to your collection' : 'Removed from saved', 'success');
      void qc.invalidateQueries({ queryKey: qk.feed.saved });
    },
  });

  const edit = useMutation({
    mutationFn: (patch: { caption: string; comments_enabled: boolean }) =>
      updatePost(supabase, post.id, patch),
    onSuccess: (_d, patch) => {
      updatePostEverywhere(qc, post.id, (p) => ({ ...p, ...patch }));
      toast.show('Post updated', 'success');
    },
    onError: (error) => toast.show(friendlyError(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => deletePost(supabase, post.id),
    onSuccess: () => {
      updatePostEverywhere(qc, post.id, () => null);
      qc.removeQueries({ queryKey: qk.post(post.id) });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      toast.show('Post deleted', 'success');
    },
    onError: (error) => toast.show(friendlyError(error), 'error'),
  });

  return { like, save, edit, remove, canAct: !!userId };
}
