import {
  deletePost,
  qk,
  restoreSnapshot,
  setLiked,
  setSaved,
  updatePostEverywhere,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function usePostActions(post: PostCard) {
  const qc = useQueryClient();
  const { userId } = useAuth();

  const like = useMutation({
    mutationFn: (liked: boolean) => setLiked(supabase, userId!, post.id, liked),
    onMutate: (liked) => {
      void Haptics.selectionAsync();
      return updatePostEverywhere(qc, post.id, (p) =>
        p.liked_by_me === liked
          ? p
          : { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) },
      );
    },
    onError: (e, _v, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      Alert.alert('Couldn’t update like', friendlyError(e));
    },
  });

  const save = useMutation({
    mutationFn: (saved: boolean) => setSaved(supabase, userId!, post.id, saved),
    onMutate: (saved) => updatePostEverywhere(qc, post.id, (p) => ({ ...p, saved_by_me: saved })),
    onError: (e, _v, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      Alert.alert('Couldn’t save', friendlyError(e));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.feed.saved }),
  });

  const remove = useMutation({
    mutationFn: () => deletePost(supabase, post.id),
    onSuccess: () => {
      updatePostEverywhere(qc, post.id, () => null);
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => Alert.alert('Couldn’t delete', friendlyError(e)),
  });

  return { like, save, remove };
}
