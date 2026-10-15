import { fetchHashtagFeed, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList } from 'react-native';
import { PostTile } from '@/components/PostGrid';
import { Empty, ErrorView, Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function TagScreen() {
  const { tag = '' } = useLocalSearchParams<{ tag: string }>();
  const q = useInfiniteQuery({
    queryKey: qk.feed.hashtag(tag),
    queryFn: ({ pageParam }) => fetchHashtagFeed(supabase, tag, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.hashtag),
  });
  return (
    <>
      <Stack.Screen options={{ title: `#${tag}` }} />
      <FlatList
        data={flattenUnique(q.data?.pages)}
        numColumns={3}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostTile post={item} />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        ListEmptyComponent={
          q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorView error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <Empty icon="hash" title="No posts yet" />
          )
        }
      />
    </>
  );
}
