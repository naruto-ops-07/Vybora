import {
  block,
  createSecureConversation,
  fetchProfile,
  fetchProfilePosts,
  follow,
  mute,
  PAGE,
  qk,
  reportContent,
  unblock,
  unfollow,
  unmute,
} from '@vybora/api';
import {
  flattenUnique,
  followButtonState,
  formatCount,
  friendlyError,
  timeCursorOf,
  type TimeCursor,
} from '@vybora/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, View } from 'react-native';
import { PostTile } from '@/components/PostGrid';
import { Avatar, Button, Empty, ErrorView, Icon, IconButton, Loading, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <Pressable
      style={{ alignItems: 'center', flex: 1 }}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
    >
      <Text style={{ fontWeight: '700', fontSize: 17 }}>{formatCount(value)}</Text>
      <Text variant="muted">{label}</Text>
    </Pressable>
  );
}

const REPORT_REASONS = [
  ['Spam', 'spam'],
  ['Harassment', 'harassment'],
  ['Impersonation or other', 'other'],
] as const;

export function ProfileScreen({ username, isTab }: { username: string; isTab?: boolean }) {
  const t = useTheme();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const key = qk.profile(username.toLowerCase());
  const profile = useQuery({ queryKey: key, queryFn: () => fetchProfile(supabase, username) });
  const p = profile.data;
  const posts = useInfiniteQuery({
    queryKey: qk.feed.profile(p?.id ?? '', tab),
    queryFn: ({ pageParam }) =>
      fetchProfilePosts(supabase, p!.id, tab === 'reels' ? 'reel' : null, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.profile),
    enabled: !!p?.can_view_content,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: qk.feed.home });
  };
  const onError = (e: unknown) => Alert.alert('Something went wrong', friendlyError(e));
  const followMut = useMutation({
    mutationFn: () => follow(supabase, userId!, p!.id),
    onSuccess: refresh,
    onError,
  });
  const unfollowMut = useMutation({
    mutationFn: () => unfollow(supabase, userId!, p!.id),
    onSuccess: refresh,
    onError,
  });
  const blockMut = useMutation({
    mutationFn: (on: boolean) =>
      on ? block(supabase, userId!, p!.id) : unblock(supabase, userId!, p!.id),
    onSuccess: refresh,
    onError,
  });
  const muteMut = useMutation({
    mutationFn: (on: boolean) =>
      on ? mute(supabase, userId!, p!.id) : unmute(supabase, userId!, p!.id),
    onSuccess: (_d, on) => {
      refresh();
      void qc.invalidateQueries({ queryKey: qk.feed.all });
      void qc.invalidateQueries({ queryKey: qk.stories.tray });
      Alert.alert(
        on ? 'Muted' : 'Unmuted',
        on
          ? `You’ll still follow ${p!.username}, but their posts and stories won’t appear in your feed.`
          : `${p!.username}’s posts will appear in your feed again.`,
      );
    },
    onError,
  });
  const report = (reason: string) =>
    reportContent(supabase, userId!, { target_type: 'profile', target_id: p!.id, reason }).then(
      () => Alert.alert('Thanks for reporting', 'Our team will review this account.'),
      onError,
    );
  const openFollows = (direction: 'followers' | 'following') =>
    router.push({
      pathname: '/follows/[userId]',
      params: { userId: p!.id, direction, username: p!.username, me: p!.is_me ? '1' : '0' },
    });

  const message = useMutation({
    mutationFn: () => createSecureConversation(supabase, 'direct', [p!.id]),
    onSuccess: (id) => router.push({ pathname: '/messages/[id]', params: { id } }),
    onError,
  });

  if (profile.isPending) return <Loading />;
  if (profile.isError)
    return <ErrorView error={profile.error} onRetry={() => void profile.refetch()} />;
  if (!p) return <Empty icon="user-x" title="This account isn’t available" />;

  const state = followButtonState(p);
  const items = flattenUnique(posts.data?.pages);

  const header = (
    <View style={{ padding: 16, gap: 14, backgroundColor: t.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text variant="title" style={{ flex: 1, fontSize: 22 }} accessibilityRole="header">
          {p.username}
        </Text>
        {p.is_private && <Icon name="lock" size={16} />}
        {isTab && (
          <>
            <IconButton name="bookmark" label="Saved" onPress={() => router.push('/saved')} />
            <IconButton
              name="message-circle"
              label="Messages"
              onPress={() => router.push('/messages')}
            />
            <IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} />
          </>
        )}
        {!p.is_me && userId && (
          <IconButton
            name="more-horizontal"
            label="More options"
            onPress={() =>
              Alert.alert(p.username, undefined, [
                ...(p.blocked_by_me
                  ? []
                  : [
                      {
                        text: p.muted_by_me ? 'Unmute' : 'Mute',
                        onPress: () => muteMut.mutate(!p.muted_by_me),
                      },
                      {
                        text: 'Report',
                        onPress: () =>
                          Alert.alert('Why are you reporting this account?', undefined, [
                            ...REPORT_REASONS.map(([text, reason]) => ({
                              text,
                              onPress: () => void report(reason),
                            })),
                            { text: 'Cancel', style: 'cancel' as const },
                          ]),
                      },
                    ]),
                {
                  text: p.blocked_by_me ? 'Unblock' : 'Block',
                  style: 'destructive',
                  onPress: () =>
                    p.blocked_by_me
                      ? blockMut.mutate(false)
                      : Alert.alert(
                          `Block ${p.username}?`,
                          'They won’t be able to see your profile or message you.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Block',
                              style: 'destructive',
                              onPress: () => blockMut.mutate(true),
                            },
                          ],
                        ),
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar path={p.avatar_path} name={p.username} size={84} />
        <Stat value={p.posts_count} label="posts" />
        <Stat
          value={p.followers_count}
          label="followers"
          onPress={p.can_view_content ? () => openFollows('followers') : undefined}
        />
        <Stat
          value={p.following_count}
          label="following"
          onPress={p.can_view_content ? () => openFollows('following') : undefined}
        />
      </View>
      <View style={{ gap: 2 }}>
        {!!p.display_name && <Text variant="label">{p.display_name}</Text>}
        {!!p.bio && <Text>{p.bio}</Text>}
        {!!p.website && (
          <Pressable onPress={() => void Linking.openURL(p.website!)} accessibilityRole="link">
            <Text style={{ color: t.accent, fontWeight: '600' }}>
              {p.website.replace(/^https?:\/\//, '')}
            </Text>
          </Pressable>
        )}
        {p.follows_me && !p.is_me && <Text variant="small">Follows you</Text>}
        {p.muted_by_me && <Text variant="small">Muted — hidden from your feed</Text>}
      </View>
      {p.is_me ? (
        <Button title="Edit profile" variant="secondary" onPress={() => router.push('/settings')} />
      ) : p.blocked_by_me ? (
        <Button
          title="Unblock"
          variant="secondary"
          onPress={() => blockMut.mutate(false)}
          loading={blockMut.isPending}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            title={
              {
                follow: 'Follow',
                follow_back: 'Follow back',
                requested: 'Requested',
                following: 'Following',
                hidden: '',
              }[state]
            }
            variant={state === 'follow' || state === 'follow_back' ? 'primary' : 'secondary'}
            loading={followMut.isPending || unfollowMut.isPending}
            onPress={() =>
              state === 'follow' || state === 'follow_back'
                ? followMut.mutate()
                : unfollowMut.mutate()
            }
          />
          <Button
            style={{ flex: 1 }}
            title="Message"
            variant="secondary"
            onPress={() => message.mutate()}
            loading={message.isPending}
          />
        </View>
      )}
      {p.can_view_content && (
        <View
          style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.border }}
          accessibilityRole="tablist"
        >
          {(['posts', 'reels'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setTab(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === v }}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: 2,
                borderTopColor: tab === v ? t.text : 'transparent',
                marginTop: -1,
              }}
            >
              <Icon
                name={v === 'posts' ? 'grid' : 'film'}
                size={20}
                color={tab === v ? t.text : t.textSubtle}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={p.can_view_content && !p.blocked_by_me ? items : []}
      numColumns={3}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <PostTile post={item} />}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl
          refreshing={profile.isRefetching}
          onRefresh={() => {
            void profile.refetch();
            void posts.refetch();
          }}
          tintColor={t.accent}
        />
      }
      onEndReached={() =>
        posts.hasNextPage && !posts.isFetchingNextPage && void posts.fetchNextPage()
      }
      ListEmptyComponent={
        p.blocked_by_me ? (
          <Empty icon="slash" title={`You blocked ${p.username}`} />
        ) : !p.can_view_content ? (
          <Empty
            icon="lock"
            title="This account is private"
            body={
              p.follow_status === 'pending'
                ? 'Your request is pending.'
                : 'Follow to see their photos and videos.'
            }
          />
        ) : posts.isPending ? (
          <Loading />
        ) : (
          <Empty
            icon={tab === 'reels' ? 'film' : 'camera'}
            title={tab === 'reels' ? 'No reels yet' : 'No posts yet'}
          />
        )
      }
    />
  );
}
