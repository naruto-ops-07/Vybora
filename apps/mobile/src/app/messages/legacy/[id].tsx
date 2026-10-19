import {
  createSecureConversation,
  deleteMessage,
  fetchConversationPeer,
  fetchMessages,
  markConversationRead,
  MESSAGE_PAGE,
  qk,
  subscribeToConversation,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { Message } from '@vybora/types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Icon, Loading, Text } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Pages = InfiniteData<Message[], { created_at: string; id: string } | null>;

function Attachment({ path }: { path: string }) {
  const { radii } = useTheme();
  // Short-lived signed URL; the `dm` bucket is private.
  const { data: uri } = useSignedUrl(path, 'dm');
  return (
    <Image
      source={uri ? { uri } : undefined}
      style={{ width: 200, height: 240, borderRadius: radii.md }}
      contentFit="cover"
      accessibilityLabel="Shared image"
    />
  );
}

/**
 * Read-only view of a pre-encryption conversation. New messages go through an
 * end-to-end encrypted chat (enforced server-side by migration 0011); senders
 * can still unsend their old messages.
 */
export default function LegacyConversation() {
  const { radii } = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const key = qk.messages(id);
  const [live, setLive] = useState(true);

  const peer = useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => fetchConversationPeer(supabase, id, userId),
  });
  const messages = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchMessages(supabase, id, pageParam),
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < MESSAGE_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
  });

  // Mark read only while this screen is open, the app is foregrounded and messages have loaded.
  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active' || !messages.isSuccess) return;
    void markConversationRead(supabase, id).then(() => {
      void qc.invalidateQueries({ queryKey: qk.unread });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    });
  }, [id, messages.isSuccess, qc]);

  useEffect(() => {
    markRead();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void qc.invalidateQueries({ queryKey: key });
        markRead();
      }
    });
    return () => sub.remove();
  }, [markRead, qc, key]);

  useEffect(() => {
    let connectedBefore = false;
    return subscribeToConversation(supabase, id, {
      onInsert: () => void qc.invalidateQueries({ queryKey: key }),
      onDelete: (mid) =>
        qc.setQueryData<Pages>(key, (d) =>
          d ? { ...d, pages: d.pages.map((p) => p.filter((m) => m.id !== mid)) } : d,
        ),
      onStatus: (s) => {
        if (s === 'SUBSCRIBED') {
          if (connectedBefore) void qc.invalidateQueries({ queryKey: key });
          connectedBefore = true;
          setLive(true);
        } else setLive(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  const other = peer.data?.other;
  const continueSecurely = useMutation({
    mutationFn: () => createSecureConversation(supabase, 'direct', [other!.id]),
    onSuccess: (cid) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      router.replace({ pathname: '/messages/[id]', params: { id: cid } });
    },
    onError: (e) => Alert.alert('Couldn’t start an encrypted chat', friendlyError(e)),
  });

  /** Unsend: RLS only allows deleting your own messages; realtime removes it for the other member. */
  const confirmUnsend = (m: Message) =>
    Alert.alert('Unsend message?', 'It will be removed for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unsend',
        style: 'destructive',
        onPress: () => {
          qc.setQueryData<Pages>(key, (d) =>
            d ? { ...d, pages: d.pages.map((p) => p.filter((x) => x.id !== m.id)) } : d,
          );
          deleteMessage(supabase, m.id).then(
            () => void qc.invalidateQueries({ queryKey: qk.conversations }),
            (e) => {
              void qc.invalidateQueries({ queryKey: key }); // restore the server's truth
              Alert.alert('Couldn’t unsend', friendlyError(e));
            },
          );
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar
                path={other?.avatar_path}
                name={other?.username ?? '?'}
                userId={other?.id ?? id}
                displayName={other?.display_name}
                size={28}
              />
              <View>
                <Text variant="label">{other?.username ?? ''}</Text>
                <Text variant="mono" style={{ color: t.warning }}>
                  {live ? 'legacy · not encrypted' : 'reconnecting'}
                </Text>
              </View>
            </View>
          ),
        }}
      />
      {messages.isPending ? (
        <Loading />
      ) : (
        <FlatList
          inverted
          data={messages.data?.pages.flat() ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          onEndReached={() => messages.hasNextPage && void messages.fetchNextPage()}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <Pressable
                disabled={!mine}
                onLongPress={() => mine && confirmUnsend(item)}
                delayLongPress={350}
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 4 }}
                accessibilityHint={mine ? 'Long press to unsend' : undefined}
              >
                {item.attachment_path && <Attachment path={item.attachment_path} />}
                {!!item.body && (
                  <View
                    style={{
                      backgroundColor: mine ? t.surfaceStrong : t.surface,
                      borderWidth: mine ? 0 : 1,
                      borderColor: t.border,
                      borderRadius: radii.lg,
                      borderBottomRightRadius: mine ? radii.sm : radii.lg,
                      borderBottomLeftRadius: mine ? radii.lg : radii.sm,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text>{item.body}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text
              variant="muted"
              style={{ textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] }}
            >
              No messages in this chat.
            </Text>
          }
        />
      )}
      <View
        style={{
          gap: 10,
          padding: 12,
          paddingBottom: 12 + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: t.border,
          backgroundColor: t.surface,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="lock" size={16} color={t.accent} />
          <Text variant="small" style={{ flex: 1 }}>
            This chat predates end-to-end encryption and is read-only. Continue the conversation
            securely.
          </Text>
        </View>
        <Button
          title="Continue in encrypted chat"
          icon="lock"
          onPress={() => continueSecurely.mutate()}
          loading={continueSecurely.isPending}
          disabled={!other}
        />
      </View>
    </View>
  );
}
