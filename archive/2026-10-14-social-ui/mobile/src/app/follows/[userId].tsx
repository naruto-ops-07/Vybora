import { fetchFollowList, qk, removeFollower } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Avatar, Button, Empty, ErrorView, Icon, Loading, Text } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Direction = 'followers' | 'following';

export default function FollowList() {
  const params = useLocalSearchParams<{
    userId: string;
    direction?: string;
    username?: string;
    me?: string;
  }>();
  const userId = params.userId ?? '';
  const isMe = params.me === '1';
  const [direction, setDirection] = useState<Direction>(
    params.direction === 'following' ? 'following' : 'followers',
  );
  const { userId: myId } = useMe();
  const t = useTheme();
  const qc = useQueryClient();

  const q = useInfiniteQuery({
    queryKey: qk.followList(userId, direction),
    queryFn: ({ pageParam }) => fetchFollowList(supabase, userId, direction, pageParam),
    initialPageParam: null as { followed_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < 30
        ? null
        : { followed_at: last[last.length - 1]!.followed_at, id: last[last.length - 1]!.id },
  });

  const remove = useMutation({
    mutationFn: (followerId: string) => removeFollower(supabase, myId, followerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.followList(userId, 'followers') });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => Alert.alert('Couldn’t remove follower', friendlyError(e)),
  });

  const rows = q.data?.pages.flat() ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.surface }}>
      <Stack.Screen options={{ title: params.username ?? '' }} />
      <View
        style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.border }}
        accessibilityRole="tablist"
      >
        {(['followers', 'following'] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => setDirection(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected: direction === d }}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 12,
              borderBottomWidth: 2,
              borderBottomColor: direction === d ? t.text : 'transparent',
            }}
          >
            <Text
              variant="label"
              style={{
                color: direction === d ? t.text : t.textSubtle,
                textTransform: 'capitalize',
              }}
            >
              {d}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(u) => u.id}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching}
            onRefresh={() => void q.refetch()}
            tintColor={t.accent}
          />
        }
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        renderItem={({ item: u }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
              onPress={() =>
                router.push({ pathname: '/u/[username]', params: { username: u.username } })
              }
              accessibilityRole="link"
              accessibilityLabel={`${u.username} profile`}
            >
              <Avatar path={u.avatar_path} name={u.username} size={44} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text variant="label">{u.username}</Text>
                  {u.is_private && <Icon name="lock" size={12} />}
                </View>
                {!!u.display_name && <Text variant="muted">{u.display_name}</Text>}
              </View>
            </Pressable>
            {isMe && direction === 'followers' && (
              <Button
                title="Remove"
                compact
                variant="secondary"
                loading={remove.isPending && remove.variables === u.id}
                onPress={() =>
                  Alert.alert(
                    `Remove ${u.username}?`,
                    'They won’t be notified. They can follow you again later.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(u.id) },
                    ],
                  )
                }
              />
            )}
          </View>
        )}
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 16 }} color={t.accent} />
          ) : null
        }
        ListEmptyComponent={
          q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorView error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <Empty
              icon="users"
              title={direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            />
          )
        }
      />
    </View>
  );
}
