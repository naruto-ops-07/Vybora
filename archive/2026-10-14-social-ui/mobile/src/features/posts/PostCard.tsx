import { reportContent } from '@vybora/api';
import { canEditPost, feedAspectRatio, formatCount, formatRelativeTime } from '@vybora/core';
import type { PostCard as Post } from '@vybora/types';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Share, View } from 'react-native';
import { MediaPager } from '@/components/Media';
import { RichText } from '@/components/RichText';
import { Avatar, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { usePostActions } from './usePostActions';

export function sharePost(post: Post) {
  const url = `${siteUrl}/p/${post.id}`;
  void Share.share(Platform.OS === 'ios' ? { url } : { message: url });
}

function showOptions(options: string[], destructive: number[], onSelect: (i: number) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options, 'Cancel'],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: destructive,
      },
      (i) => i < options.length && onSelect(i),
    );
  } else {
    Alert.alert('Options', undefined, [
      ...options.map((o, i) => ({
        text: o,
        onPress: () => onSelect(i),
        style: destructive.includes(i) ? ('destructive' as const) : ('default' as const),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }
}

export const PostCardView = memo(function PostCardView({
  post,
  visible = true,
}: {
  post: Post;
  visible?: boolean;
}) {
  const t = useTheme();
  const { userId } = useAuth();
  const { like, save, remove } = usePostActions(post);
  const [expanded, setExpanded] = useState(false);
  const first = post.media[0];
  const aspect = first ? feedAspectRatio(first.width, first.height) : 1;
  const isOwner = canEditPost(userId, post);
  const openAuthor = () =>
    router.push({ pathname: '/u/[username]', params: { username: post.author.username } });
  const openPost = () => router.push({ pathname: '/p/[id]', params: { id: post.id } });

  const onMore = () => {
    if (isOwner) {
      showOptions(['Share', 'Edit', 'Delete'], [2], (i) => {
        if (i === 0) sharePost(post);
        if (i === 1) router.push({ pathname: '/edit-post/[id]', params: { id: post.id } });
        if (i === 2)
          Alert.alert(
            'Delete this post?',
            'This permanently removes the post, its comments and likes.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
            ],
          );
      });
    } else {
      showOptions(['Share', 'Report'], [1], (i) => {
        if (i === 0) sharePost(post);
        if (i === 1 && userId)
          showOptions(
            ['Spam', 'Harassment', 'Hate speech', 'Nudity', 'Violence', 'Something else'],
            [],
            (r) => {
              const reason = (
                ['spam', 'harassment', 'hate', 'nudity', 'violence', 'other'] as const
              )[r]!;
              void reportContent(supabase, userId, {
                target_type: 'post',
                target_id: post.id,
                reason,
              }).then(
                () => Alert.alert('Thanks for reporting', 'Our team will review this post.'),
                () => Alert.alert('Report failed', 'Please try again.'),
              );
            },
          );
      });
    }
  };

  return (
    <View
      style={{ backgroundColor: t.surface, marginBottom: 8 }}
      accessibilityLabel={`Post by ${post.author.username}`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        <Pressable
          onPress={openAuthor}
          accessibilityRole="link"
          accessibilityLabel={`${post.author.username} profile`}
        >
          <Avatar path={post.author.avatar_path} name={post.author.username} size={34} />
        </Pressable>
        <Pressable onPress={openAuthor} style={{ flex: 1 }}>
          <Text variant="label">{post.author.username}</Text>
          <Text variant="small">
            {formatRelativeTime(post.created_at)}
            {post.kind === 'reel' ? ' · Reel' : ''}
          </Text>
        </Pressable>
        <IconButton name="more-horizontal" label="Post options" onPress={onMore} size={20} />
      </View>

      <Pressable
        onLongPress={() => userId && !post.liked_by_me && like.mutate(true)}
        delayLongPress={250}
      >
        <MediaPager
          media={post.media}
          aspect={aspect}
          label={`Post by ${post.author.username}`}
          visible={visible}
        />
      </Pressable>

      <View
        style={{ paddingHorizontal: 6, paddingTop: 4, flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          name="heart"
          label={post.liked_by_me ? 'Unlike' : 'Like'}
          active={post.liked_by_me}
          color={post.liked_by_me ? '#FF5C7A' : t.text}
          onPress={() => userId && like.mutate(!post.liked_by_me)}
        />
        <IconButton name="message-circle" label="Comments" onPress={openPost} />
        <IconButton name="send" label="Share" onPress={() => sharePost(post)} />
        <View style={{ flex: 1 }} />
        <IconButton
          name="bookmark"
          label={post.saved_by_me ? 'Remove from saved' : 'Save'}
          active={post.saved_by_me}
          color={post.saved_by_me ? t.accent : t.text}
          onPress={() => userId && save.mutate(!post.saved_by_me)}
        />
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 4 }}>
        <Text variant="label">
          {post.like_count === 1 ? '1 like' : `${formatCount(post.like_count)} likes`}
        </Text>
        {!!post.caption && (
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityHint={expanded ? undefined : 'Shows the full caption'}
          >
            <RichText text={`${post.caption}`} numberOfLines={expanded ? undefined : 2} />
          </Pressable>
        )}
        <Pressable onPress={openPost}>
          <Text variant="muted">
            {post.comment_count > 0
              ? `View ${post.comment_count === 1 ? '1 comment' : `all ${formatCount(post.comment_count)} comments`}`
              : post.comments_enabled
                ? 'Add a comment…'
                : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
