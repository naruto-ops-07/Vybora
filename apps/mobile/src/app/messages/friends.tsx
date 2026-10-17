import { peerOf, qk, sendFriendRequest, type Friend, type FriendRequest } from '@vybora/api';
import { formatRelativeTime, usernameFromAddParam } from '@vybora/core';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { AccessibilityInfo, FlatList, RefreshControl, View } from 'react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useOnlinePeers, useSecureInbox } from '@/features/connect/hooks';
import { useCc } from '@/features/connect/ui/primitives';
import { AddFriendForm } from '@/features/friends/AddFriendForm';
import { FriendRow } from '@/features/friends/FriendRow';
import { HandleCard } from '@/features/friends/HandleCard';
import {
  nameOf,
  useFriendActions,
  useFriendRequests,
  useFriends,
  useMessageFriend,
} from '@/features/friends/hooks';
import { RequestRow } from '@/features/friends/RequestRow';
import { FriendsEmpty } from '@/features/onboarding/EmptyStates';
import { radii } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

function SectionHeading({ title, count }: { title: string; count?: number }) {
  const cc = useCc();
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 4,
      }}
    >
      <Text style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600' }}>{title}</Text>
      {count !== undefined && (
        <Text mono style={{ color: cc.textSubtle, fontSize: 11 }}>
          {count}
        </Text>
      )}
    </View>
  );
}

/** Static placeholders (no shimmer, so nothing to switch off for reduced motion). */
function Skeleton() {
  const cc = useCc();
  return (
    <View accessibilityLabel="Loading friends" accessibilityState={{ busy: true }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: cc.raised }} />
          <View style={{ gap: 8 }}>
            <View
              style={{ width: 120, height: 12, borderRadius: radii.sm, backgroundColor: cc.raised }}
            />
            <View
              style={{ width: 80, height: 12, borderRadius: radii.sm, backgroundColor: cc.raised }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  const cc = useCc();
  return (
    <View
      accessibilityRole="alert"
      style={{ alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 20 }}
    >
      <Text style={{ color: cc.textMuted, fontSize: 14, textAlign: 'center' }}>{message}</Text>
      <Button title="Try again" variant="outline" icon="rotate-cw" compact onPress={onRetry} />
    </View>
  );
}

export default function FriendsScreen() {
  const cc = useCc();
  const qc = useQueryClient();
  const { userId } = useMe();
  const focused = useIsFocused();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const prefill = usernameFromAddParam(typeof add === 'string' ? add : null);
  const friends = useFriends();
  const requests = useFriendRequests(focused);
  const inbox = useSecureInbox();
  const { respond, cancel, remove } = useFriendActions();
  const message = useMessageFriend();

  const list = useMemo(() => friends.data ?? [], [friends.data]);
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];

  // The server only shares presence between people who share a chat, so only
  // look up friends I already have a direct chat with.
  const chatPeers = useMemo(
    () =>
      new Set((inbox.data ?? []).map((c) => peerOf(c, userId)?.id).filter((x): x is string => !!x)),
    [inbox.data, userId],
  );
  const online = useOnlinePeers(
    useMemo(
      () => list.filter((f) => chatPeers.has(f.userId)).map((f) => f.userId),
      [list, chatPeers],
    ),
  );

  const send = useCallback(
    async (username: string) => {
      const result = await sendFriendRequest(supabase, username);
      void qc.invalidateQueries({ queryKey: qk.connect.friendRequests });
      if (result === 'accepted') void qc.invalidateQueries({ queryKey: qk.connect.friends });
      return result;
    },
    [qc],
  );

  const say = (text: string) => void AccessibilityInfo.announceForAccessibility(text);
  const now = new Date();
  const when = (r: FriendRequest) =>
    r.createdAt ? formatRelativeTime(r.createdAt, now) : undefined;
  const hasRequests = incoming.length + outgoing.length > 0;

  const header = (
    <View>
      <AddFriendForm onSubmit={send} prefill={prefill} />
      {requests.isError && !requests.data && (
        <Retry message="Couldn’t load friend requests." onRetry={() => void requests.refetch()} />
      )}
      {hasRequests && (
        <View>
          <SectionHeading title="Requests" count={incoming.length + outgoing.length} />
          {incoming.map((r) => (
            <RequestRow
              key={`in-${r.userId}`}
              direction="incoming"
              request={r}
              when={when(r)}
              onAccept={() => {
                respond.mutate(
                  { request: r, accept: true },
                  { onSuccess: () => say(`You and ${nameOf(r)} are now friends`) },
                );
              }}
              onDecline={() => {
                respond.mutate(
                  { request: r, accept: false },
                  { onSuccess: () => say(`Declined ${nameOf(r)}’s request`) },
                );
              }}
            />
          ))}
          {outgoing.map((r) => (
            <RequestRow
              key={`out-${r.userId}`}
              direction="outgoing"
              request={r}
              onCancel={() => {
                cancel.mutate(r, {
                  onSuccess: () => say(`Cancelled your request to ${nameOf(r)}`),
                });
              }}
            />
          ))}
        </View>
      )}
      <SectionHeading title="Friends" count={friends.isSuccess ? list.length : undefined} />
      {friends.isPending && <Skeleton />}
      {friends.isError && (
        <Retry message="Couldn’t load your friends." onRetry={() => void friends.refetch()} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: cc.panel }}>
      <Stack.Screen
        options={{
          title: 'Friends',
          headerStyle: { backgroundColor: cc.panel },
          headerTintColor: cc.text,
        }}
      />
      <FlatList
        data={list}
        keyExtractor={(f: Friend) => f.userId}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={friends.isRefetching || requests.isRefetching}
            onRefresh={() => {
              void friends.refetch();
              void requests.refetch();
            }}
            tintColor={cc.accent}
          />
        }
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <FriendRow
            friend={item}
            online={online.has(item.userId)}
            busy={message.pendingId === item.userId}
            onMessage={message.open}
            onRemove={(f) => {
              remove.mutate(f, { onSuccess: () => say(`Removed ${nameOf(f)} from friends`) });
            }}
          />
        )}
        ListEmptyComponent={friends.isSuccess ? <FriendsEmpty handle={<HandleCard />} /> : null}
      />
    </View>
  );
}
