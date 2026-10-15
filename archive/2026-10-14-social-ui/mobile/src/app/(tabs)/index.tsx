import { fetchHomeFeed, fetchUnreadCounts, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Empty, ErrorView, IconButton, Loading, Text } from '@/components/ui';
import { PostCardView } from '@/features/posts/PostCard';
import { StoryTray } from '@/features/stories/StoryTray';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 2,
        right: 2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#FF5C7A',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

export default function Home() {
  const t = useTheme();
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const unread = useQuery({
    queryKey: qk.unread,
    queryFn: () => fetchUnreadCounts(supabase),
    refetchInterval: 60_000,
  });
  const feed = useInfiniteQuery({
    queryKey: qk.feed.home,
    queryFn: ({ pageParam }) => fetchHomeFeed(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.home),
  });
  const posts = flattenUnique(feed.data?.pages);

  // Only autoplay videos for posts that are on screen.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<PostCard>[] }) => {
    setVisibleIds(new Set(viewableItems.map((v) => v.item.id)));
  }, []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          height: 52,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          backgroundColor: t.surface,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <Text
          style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, flex: 1 }}
          accessibilityRole="header"
        >
          vybora
        </Text>
        <View>
          <IconButton
            name="heart"
            label={`Notifications${unread.data?.notifications ? `, ${unread.data.notifications} unread` : ''}`}
            onPress={() => router.push('/notifications')}
          />
          <Badge count={unread.data?.notifications ?? 0} />
        </View>
        <View>
          <IconButton
            name="message-circle"
            label={`Messages${unread.data?.conversations ? `, ${unread.data.conversations} unread` : ''}`}
            onPress={() => router.push('/messages')}
          />
          <Badge count={unread.data?.conversations ?? 0} />
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} visible={visibleIds.has(item.id)} />}
        ListHeaderComponent={<StoryTray />}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={t.accent}
          />
        }
        onEndReachedThreshold={0.6}
        onEndReached={() =>
          feed.hasNextPage && !feed.isFetchingNextPage && void feed.fetchNextPage()
        }
        ListEmptyComponent={
          feed.isPending ? (
            <Loading />
          ) : feed.isError ? (
            <ErrorView error={feed.error} onRetry={() => void feed.refetch()} />
          ) : (
            <Empty
              icon="users"
              title="Your feed is waiting"
              body="Follow a few creators and their posts will show up here."
              action={<Button title="Discover people" onPress={() => router.push('/explore')} />}
            />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 24 }} color={t.accent} />
          ) : null
        }
        removeClippedSubviews
        windowSize={7}
      />
    </SafeAreaView>
  );
}
