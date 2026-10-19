import { peerOf, qk, sendFriendRequest, type Friend, type FriendRequest } from '@vybora/api';
import { formatRelativeTime, usernameFromAddParam } from '@vybora/core';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, RefreshControl, View } from 'react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useOnlinePeers, useSecureInbox } from '@/features/connect/hooks';
import { useCc } from '@/features/connect/ui/primitives';
import { AddFriendForm } from '@/features/friends/AddFriendForm';
import { FriendJoinedCard, type JoinedPerson } from '@/features/friends/FriendJoined';
import { FriendRow } from '@/features/friends/FriendRow';
import { HandleCard } from '@/features/friends/HandleCard';
import {
  nameOf,
  useFriendActions,
  useFriendRequests,
  useFriends,
  useMessageFriend,
} from '@/features/friends/hooks';
import { RequestsSection } from '@/features/friends/RequestsSection';
import { FriendsEmpty } from '@/features/onboarding/EmptyStates';
import { useA11y } from '@/lib/a11y';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

/** The friendship the joined card is for (or waiting to show). */
interface Joined {
  run: number;
  /** An accepted request: who it was. */
  person?: JoinedPerson;
  username: string;
  /** I accepted their request, or my `send` found theirs waiting. */
  via: 'accept' | 'send';
  /** When the friends list had last settled, as it happened. */
  settles: number;
  shown: boolean;
}

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
  const { radii } = useTheme();
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
  const { userId, profile } = useMe();
  const { reduceMotion } = useA11y();
  const focused = useIsFocused();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const prefill = usernameFromAddParam(typeof add === 'string' ? add : null);
  const friends = useFriends();
  const requests = useFriendRequests(focused);
  const inbox = useSecureInbox();
  const { respond, cancel, remove } = useFriendActions();
  const message = useMessageFriend();

  const list = useMemo(() => friends.data ?? [], [friends.data]);

  // A new friendship: one card at a time, the latest wins; `run` restarts the slide.
  const [joined, setJoined] = useState<Joined | null>(null);
  const settles = Math.max(friends.dataUpdatedAt, friends.errorUpdatedAt);
  const settlesRef = useRef(settles);
  settlesRef.current = settles;
  const join = (who: Pick<Joined, 'person' | 'username' | 'via'>) =>
    setJoined((j) => ({
      run: (j?.run ?? 0) + 1,
      ...who,
      settles: settlesRef.current,
      shown: false,
    }));
  const listed = joined
    ? list.find((f) =>
        joined.person ? f.userId === joined.person.userId : f.username === joined.username,
      )
    : undefined;
  // An accepted request carries the person; a `send` that found theirs waits for the list.
  const joinedFriend: JoinedPerson | undefined =
    listed ?? (joined?.via === 'accept' && !friends.isSuccess ? joined.person : undefined);
  const settledSinceJoin = !friends.isFetching && settles > (joined?.settles ?? Infinity);
  useEffect(() => {
    if (!joined) return;
    if (joinedFriend) {
      if (!joined.shown) setJoined({ ...joined, shown: true });
      return;
    }
    // Shown and since removed, or never found once the list came back: drop it,
    // so a later refetch can't pop up a stale card. The add form's message stays.
    if (joined.shown || settledSinceJoin) setJoined(null);
  }, [joined, joinedFriend, settledSinceJoin]);
  const joinedRun = joinedFriend ? joined!.run : 0;
  const me: JoinedPerson = {
    userId,
    username: profile?.username ?? '',
    displayName: profile?.display_name ?? null,
    avatarPath: profile?.avatar_path ?? null,
  };
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
      if (result === 'accepted') {
        setJoined((j) => ({
          run: (j?.run ?? 0) + 1,
          username,
          via: 'send',
          settles: settlesRef.current,
          shown: false,
        }));
        void qc.invalidateQueries({ queryKey: qk.connect.friends });
      }
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
      {joinedFriend && (
        <FriendJoinedCard
          me={me}
          friend={joinedFriend}
          animate={!reduceMotion}
          run={joinedRun}
          sayingHi={message.pendingId === joinedFriend.userId}
          onSayHi={() => message.open({ ...joinedFriend, since: null })}
          onDismiss={() => setJoined(null)}
        />
      )}
      <AddFriendForm
        onSubmit={send}
        prefill={prefill}
        acceptedReplaced={joined?.via === 'send' ? joinedRun : 0}
      />
      {requests.isError && !requests.data && (
        <Retry message="Couldn’t load friend requests." onRetry={() => void requests.refetch()} />
      )}
      {hasRequests && (
        <View>
          <SectionHeading title="Requests" count={incoming.length + outgoing.length} />
          <RequestsSection
            incoming={incoming}
            outgoing={outgoing}
            when={when}
            onAccept={(r) => {
              join({ person: r, username: r.username, via: 'accept' });
              respond.mutate(
                { request: r, accept: true },
                { onSuccess: () => say(`You and ${nameOf(r)} are now friends`) },
              );
            }}
            onDecline={(r) => {
              respond.mutate(
                { request: r, accept: false },
                { onSuccess: () => say(`Declined ${nameOf(r)}’s request`) },
              );
            }}
            onCancel={(r) => {
              cancel.mutate(r, {
                onSuccess: () => say(`Cancelled your request to ${nameOf(r)}`),
              });
            }}
          />
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
