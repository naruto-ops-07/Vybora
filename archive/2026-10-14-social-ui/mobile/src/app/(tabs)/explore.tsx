import { fetchExplore, PAGE, qk, searchHashtags, searchProfiles } from '@vybora/api';
import {
  flattenUnique,
  formatCount,
  scoreCursorOf,
  type ScoreCursor,
  type TimeCursor,
} from '@vybora/core';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostTile } from '@/components/PostGrid';
import { Avatar, Empty, ErrorView, Icon, Loading, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { radii, useTheme } from '@/lib/theme';

export default function Explore() {
  const t = useTheme();
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const people = useQuery({
    queryKey: qk.search(q),
    queryFn: () => searchProfiles(supabase, q),
    enabled: q.length > 0 && !q.startsWith('#'),
  });
  const tags = useQuery({
    queryKey: qk.hashtagSearch(q),
    queryFn: () => searchHashtags(supabase, q),
    enabled: q.length > 0,
  });
  const grid = useInfiniteQuery({
    queryKey: qk.feed.explore('trending'),
    queryFn: ({ pageParam }) => fetchExplore(supabase, 'trending', pageParam),
    initialPageParam: null as ScoreCursor | TimeCursor | null,
    getNextPageParam: (last) => scoreCursorOf(last, PAGE.explore),
  });
  const posts = flattenUnique(grid.data?.pages);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 12, backgroundColor: t.surface }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surfaceMuted,
            borderRadius: radii.md,
            paddingHorizontal: 12,
          }}
        >
          <Icon name="search" size={18} color={t.textSubtle} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search people and #tags"
            placeholderTextColor={t.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search"
            style={{ flex: 1, height: 44, color: t.text, fontSize: 16 }}
          />
        </View>
      </View>

      {q ? (
        <FlatList
          data={[
            ...(people.data ?? []).map((p) => ({ kind: 'user' as const, ...p })),
            ...(tags.data ?? []).map((h) => ({ kind: 'tag' as const, ...h })),
          ]}
          keyExtractor={(i) => `${i.kind}:${i.id}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.kind === 'user' ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/u/[username]', params: { username: item.username } })
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
              >
                <Avatar path={item.avatar_path} name={item.username} size={44} />
                <View>
                  <Text variant="label">{item.username}</Text>
                  <Text variant="muted">
                    {item.display_name} · {formatCount(item.followers_count ?? 0)} followers
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push({ pathname: '/tags/[tag]', params: { tag: item.tag } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: t.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="hash" />
                </View>
                <View>
                  <Text variant="label">#{item.tag}</Text>
                  <Text variant="muted">{formatCount(item.post_count)} posts</Text>
                </View>
              </Pressable>
            )
          }
          ListEmptyComponent={
            people.isPending || tags.isPending ? (
              <Loading />
            ) : (
              <Empty title="No results" body="Try a different search." />
            )
          }
        />
      ) : (
        <FlatList
          data={posts}
          numColumns={3}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostTile post={item} />}
          refreshControl={
            <RefreshControl
              refreshing={grid.isRefetching}
              onRefresh={() => void grid.refetch()}
              tintColor={t.accent}
            />
          }
          onEndReached={() =>
            grid.hasNextPage && !grid.isFetchingNextPage && void grid.fetchNextPage()
          }
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            grid.isPending ? (
              <Loading />
            ) : grid.isError ? (
              <ErrorView error={grid.error} onRetry={() => void grid.refetch()} />
            ) : (
              <Empty icon="compass" title="Nothing to explore yet" />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
