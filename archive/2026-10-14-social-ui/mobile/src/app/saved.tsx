import { fetchSaved, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl } from 'react-native';
import { PostTile } from '@/components/PostGrid';
import { Empty, ErrorView, Loading, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/** The caller's private saved collection (RLS: only the saver can read saved_posts). */
export default function Saved() {
  const t = useTheme();
  const q = useInfiniteQuery({
    queryKey: qk.feed.saved,
    queryFn: ({ pageParam }) => fetchSaved(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.saved),
  });
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={flattenUnique(q.data?.pages)}
      numColumns={3}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostTile post={item} />}
      ListHeaderComponent={
        <Text variant="muted" style={{ padding: 14 }}>
          Only you can see what you’ve saved.
        </Text>
      }
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          tintColor={t.accent}
        />
      }
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListEmptyComponent={
        q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorView error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <Empty
            icon="bookmark"
            title="Nothing saved yet"
            body="Tap the bookmark on any post to keep it here."
          />
        )
      }
    />
  );
}
