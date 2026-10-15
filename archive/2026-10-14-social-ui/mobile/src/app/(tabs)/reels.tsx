import { fetchReels, PAGE, qk } from '@vybora/api';
import { flattenUnique, formatCount, timeCursorOf, type TimeCursor } from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { SignedVideo } from '@/components/Media';
import { RichText } from '@/components/RichText';
import { Avatar, Empty, ErrorView, IconButton, Loading, Text } from '@/components/ui';
import { sharePost } from '@/features/posts/PostCard';
import { usePostActions } from '@/features/posts/usePostActions';
import { supabase } from '@/lib/supabase';

function Reel({
  post,
  active,
  preload,
  height,
  muted,
  toggleMute,
}: {
  post: PostCard;
  active: boolean;
  preload: boolean;
  height: number;
  muted: boolean;
  toggleMute: () => void;
}) {
  const { like, save } = usePostActions(post);
  const [progress, setProgress] = useState(0);
  const media = post.media[0];
  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {/* Only the active reel and its neighbours mount a player; others are disposed. */}
      {media && preload && (
        <SignedVideo
          path={media.storage_path}
          active={active}
          label={media.alt_text || `Reel by ${post.author.username}`}
          muted={muted}
          contentFit="contain"
          onProgress={setProgress}
        />
      )}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 64, bottom: 20, padding: 14, gap: 8 }}
      >
        <Pressable
          onPress={() =>
            router.push({ pathname: '/u/[username]', params: { username: post.author.username } })
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Avatar path={post.author.avatar_path} name={post.author.username} size={32} />
          <Text style={{ color: '#fff', fontWeight: '700' }}>{post.author.username}</Text>
        </Pressable>
        {!!post.caption && (
          <RichText text={post.caption} numberOfLines={3} style={{ color: '#fff' }} />
        )}
      </View>
      <View style={{ position: 'absolute', right: 6, bottom: 28, alignItems: 'center', gap: 6 }}>
        <IconButton
          name="heart"
          label={post.liked_by_me ? 'Unlike' : 'Like'}
          active={post.liked_by_me}
          color={post.liked_by_me ? '#FF5C7A' : '#fff'}
          size={28}
          onPress={() => like.mutate(!post.liked_by_me)}
        />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
          {formatCount(post.like_count)}
        </Text>
        <IconButton
          name="message-circle"
          label="Comments"
          color="#fff"
          size={28}
          onPress={() => router.push({ pathname: '/p/[id]', params: { id: post.id } })}
        />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
          {formatCount(post.comment_count)}
        </Text>
        <IconButton
          name="send"
          label="Share"
          color="#fff"
          size={26}
          onPress={() => sharePost(post)}
        />
        <IconButton
          name="bookmark"
          label={post.saved_by_me ? 'Remove from saved' : 'Save'}
          active={post.saved_by_me}
          color="#fff"
          size={26}
          onPress={() => save.mutate(!post.saved_by_me)}
        />
        <IconButton
          name={muted ? 'volume-x' : 'volume-2'}
          label={muted ? 'Unmute' : 'Mute'}
          color="#fff"
          size={24}
          onPress={toggleMute}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          backgroundColor: 'rgba(255,255,255,0.25)',
        }}
      >
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: '#fff' }} />
      </View>
    </View>
  );
}

export default function Reels() {
  const focused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const [height, setHeight] = useState(windowHeight);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const q = useInfiniteQuery({
    queryKey: qk.feed.reels,
    queryFn: ({ pageParam }) => fetchReels(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.reels),
  });
  const reels = flattenUnique(q.data?.pages);
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<PostCard>[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }, []);

  if (q.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Loading />
      </View>
    );
  if (q.isError) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  if (!reels.length)
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Empty
          icon="film"
          title="No reels yet"
          body="Share a vertical video and choose “Share as a reel”."
        />
      </View>
    );

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
    >
      <FlatList
        data={reels}
        keyExtractor={(r) => r.id}
        renderItem={({ item, index }) => (
          <Reel
            post={item}
            height={height}
            active={focused && index === active}
            preload={Math.abs(index - active) <= 1}
            muted={muted}
            toggleMute={() => setMuted((m) => !m)}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        onEndReachedThreshold={1.5}
        windowSize={3}
        maxToRenderPerBatch={2}
      />
    </View>
  );
}
