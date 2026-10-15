import {
  addComment,
  COMMENT_PAGE,
  deleteComment,
  fetchComments,
  fetchPost,
  qk,
  updatePostEverywhere,
} from '@vybora/api';
import { canDeleteComment, formatRelativeTime, friendlyError } from '@vybora/core';
import type { CommentView } from '@vybora/types';
import { LIMITS } from '@vybora/validation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichText } from '@/components/RichText';
import { Avatar, Button, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { PostCardView } from '@/features/posts/PostCard';
import { supabase } from '@/lib/supabase';
import { radii, useTheme } from '@/lib/theme';

export default function PostScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);

  const post = useQuery({ queryKey: qk.post(id), queryFn: () => fetchPost(supabase, id) });
  const comments = useInfiniteQuery({
    queryKey: qk.comments(id, null),
    queryFn: ({ pageParam }) => fetchComments(supabase, id, null, pageParam),
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < COMMENT_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
  });

  const send = useMutation({
    mutationFn: () => addComment(supabase, userId!, { postId: id, body, parentId: replyTo?.id }),
    onSuccess: () => {
      setBody('');
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ['comments', id] });
      updatePostEverywhere(qc, id, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
    onError: (e) => Alert.alert('Comment not posted', friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: (cid: string) => deleteComment(supabase, cid),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comments', id] }),
    onError: (e) => Alert.alert('Couldn’t delete', friendlyError(e)),
  });

  if (post.isPending) return <Loading />;
  if (post.isError) return <ErrorView error={post.error} onRetry={() => void post.refetch()} />;
  if (!post.data)
    return (
      <Empty
        icon="eye-off"
        title="Post unavailable"
        body="It may have been removed or made private."
        action={<Button title="Go back" onPress={() => router.back()} />}
      />
    );
  const p = post.data;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={comments.data?.pages.flat() ?? []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<PostCardView post={p} />}
        onEndReached={() => comments.hasNextPage && void comments.fetchNextPage()}
        renderItem={({ item: c }) => (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: t.surface,
            }}
          >
            <Avatar path={c.author_avatar_path} name={c.author_username} size={32} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text>
                <Text variant="label">{c.author_username} </Text>
                <RichText text={c.body} />
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text variant="small">{formatRelativeTime(c.created_at)}</Text>
                {p.comments_enabled && (
                  <Pressable
                    onPress={() => {
                      setReplyTo(c);
                      setBody(`@${c.author_username} `);
                    }}
                    accessibilityRole="button"
                  >
                    <Text variant="small" style={{ fontWeight: '700' }}>
                      Reply
                    </Text>
                  </Pressable>
                )}
                {c.reply_count > 0 && <Text variant="small">{c.reply_count} replies</Text>}
                {canDeleteComment(userId, c, p.author_id) && (
                  <Pressable
                    onPress={() =>
                      Alert.alert('Delete comment?', undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => remove.mutate(c.id),
                        },
                      ])
                    }
                    accessibilityRole="button"
                  >
                    <Text variant="small" style={{ color: t.danger }}>
                      Delete
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          comments.isPending ? (
            <Loading />
          ) : (
            <Empty
              title="No comments yet"
              body={p.comments_enabled ? 'Start the conversation.' : 'Comments are turned off.'}
            />
          )
        }
      />
      {p.comments_enabled && userId && (
        <View
          style={{
            padding: 10,
            paddingBottom: 10 + insets.bottom,
            borderTopWidth: 1,
            borderTopColor: t.border,
            backgroundColor: t.surface,
            gap: 6,
          }}
        >
          {replyTo && (
            <Pressable
              onPress={() => {
                setReplyTo(null);
                setBody('');
              }}
            >
              <Text variant="small">Replying to @{replyTo.author_username} · Cancel</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={body}
              onChangeText={setBody}
              maxLength={LIMITS.comment}
              placeholder="Add a comment…"
              placeholderTextColor={t.textSubtle}
              accessibilityLabel="Add a comment"
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: radii.pill,
                backgroundColor: t.surfaceMuted,
                paddingHorizontal: 16,
                color: t.text,
              }}
            />
            <Button
              title="Post"
              compact
              variant="ghost"
              disabled={!body.trim()}
              loading={send.isPending}
              onPress={() => send.mutate()}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
