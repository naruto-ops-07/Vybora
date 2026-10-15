import {
  fetchFollowRequests,
  fetchNotifications,
  markAllNotificationsRead,
  NOTIFICATION_PAGE,
  qk,
  respondToFollowRequest,
  subscribeToNotifications,
} from '@vybora/api';
import { formatRelativeTime, friendlyError, truncate } from '@vybora/core';
import type { NotificationView } from '@vybora/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Avatar, Button, Empty, ErrorView, Icon, Loading, Text } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

function describe(n: NotificationView): { text: string; href: Href | null } {
  const post: Href | null = n.post_id ? { pathname: '/p/[id]', params: { id: n.post_id } } : null;
  const actor: Href | null = n.actor
    ? { pathname: '/u/[username]', params: { username: n.actor.username } }
    : null;
  switch (n.type) {
    case 'follow':
      return { text: 'started following you.', href: actor };
    case 'follow_request':
      return { text: 'requested to follow you.', href: actor };
    case 'follow_accept':
      return { text: 'accepted your follow request.', href: actor };
    case 'like':
      return { text: 'liked your post.', href: post };
    case 'comment':
      return { text: `commented: ${truncate(n.body ?? '', 60)}`, href: post };
    case 'reply':
      return { text: `replied: ${truncate(n.body ?? '', 60)}`, href: post };
    case 'mention':
      return { text: 'mentioned you.', href: post };
    case 'moderation':
      return { text: n.body ?? 'Update about your account.', href: post };
    default:
      return { text: 'sent you a message.', href: '/messages' };
  }
}

export default function Notifications() {
  const t = useTheme();
  const { userId } = useMe();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) => fetchNotifications(supabase, pageParam),
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < NOTIFICATION_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
  });
  const requests = useQuery({
    queryKey: qk.followRequests,
    queryFn: () => fetchFollowRequests(supabase),
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToFollowRequest(supabase, userId, id, accept),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.followRequests }),
    onError: (e) => Alert.alert('Something went wrong', friendlyError(e)),
  });
  const items = q.data?.pages.flat() ?? [];

  useEffect(
    () =>
      subscribeToNotifications(
        supabase,
        userId,
        () => void qc.invalidateQueries({ queryKey: qk.notifications }),
      ),
    [userId, qc],
  );
  const hasUnread = items.some((n) => !n.read_at);
  useEffect(() => {
    if (q.isSuccess && hasUnread) {
      const timer = setTimeout(
        () =>
          void markAllNotificationsRead(supabase).then(() =>
            qc.invalidateQueries({ queryKey: qk.unread }),
          ),
        1500,
      );
      return () => clearTimeout(timer);
    }
  }, [q.isSuccess, hasUnread, qc]);

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => {
            void q.refetch();
            void requests.refetch();
          }}
          tintColor={t.accent}
        />
      }
      onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
      ListHeaderComponent={
        requests.data?.length ? (
          <View style={{ padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <Text variant="heading">Follow requests</Text>
            {requests.data.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar path={r.avatar_path} name={r.username} size={40} />
                <Text variant="label" style={{ flex: 1 }}>
                  {r.username}
                </Text>
                <Button
                  title="Confirm"
                  compact
                  onPress={() => respond.mutate({ id: r.id, accept: true })}
                />
                <Button
                  title="Delete"
                  compact
                  variant="secondary"
                  onPress={() => respond.mutate({ id: r.id, accept: false })}
                />
              </View>
            ))}
          </View>
        ) : null
      }
      renderItem={({ item: n }) => {
        const { text, href } = describe(n);
        return (
          <Pressable
            onPress={() => href && router.push(href)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              backgroundColor: n.read_at ? undefined : t.accentSoft,
            }}
          >
            {n.type === 'moderation' ? (
              <Icon name="shield" color={t.danger} />
            ) : (
              <Avatar path={n.actor?.avatar_path} name={n.actor?.username ?? '?'} size={42} />
            )}
            <Text style={{ flex: 1 }}>
              {n.actor && <Text variant="label">{n.actor.username} </Text>}
              {text} <Text variant="small">{formatRelativeTime(n.created_at)}</Text>
            </Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorView error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <Empty
            icon="bell"
            title="Nothing yet"
            body="Likes, comments and follows will show up here."
          />
        )
      }
    />
  );
}
