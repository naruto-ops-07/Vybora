import {
  fetchConversations,
  isMuted,
  peerOf,
  qk,
  updateConversationPreferences,
  watchPresence,
  type SecureConversation,
} from '@vybora/api';
import { truncate } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Text, TextInput } from '@/components/Text';
import { Avatar, IconButton } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import {
  conversationTitle,
  useNicknames,
  usePreviews,
  useSecureInbox,
} from '@/features/connect/hooks';
import { ConnectEmpty, PrimaryButton, useCc } from '@/features/connect/ui/primitives';
import { radii } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type Filter = 'all' | 'unread' | 'groups' | 'pinned' | 'archived';
const FILTERS: Filter[] = ['all', 'unread', 'groups', 'pinned', 'archived'];

function previewText(m: LocalMessage | undefined, myId: string): string {
  if (!m) return 'End-to-end encrypted';
  if (m.kind === 'undecryptable') return 'Message unavailable on this device';
  if (m.deleted) return 'Message deleted';
  const prefix = m.senderId === myId ? 'You: ' : '';
  if (m.kind === 'attachment') {
    const label = {
      image: 'Photo',
      video: 'Video',
      voice: 'Voice message',
      file: m.attachment?.name ?? 'File',
    }[m.attachment?.kind ?? 'file'];
    return `${prefix}${label}${m.caption ? ` · ${m.caption}` : ''}`;
  }
  return prefix + truncate(m.body ?? '', 60);
}

/** Short, fixed-width timestamp for list rows. */
function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 86_400_000)
    return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function GroupAvatar({ size }: { size: number }) {
  const cc = useCc();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: cc.strong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel="Group"
    >
      <Icon name="users" size={Math.round(size * 0.46)} color={cc.accent} />
    </View>
  );
}

function ChatRow({
  conv,
  myId,
  title,
  preview,
  time,
  online,
  onLongPress,
}: {
  conv: SecureConversation;
  myId: string;
  title: string;
  preview: string;
  time: string;
  online: boolean;
  onLongPress: () => void;
}) {
  const cc = useCc();
  const peer = peerOf(conv, myId);
  const unread = conv.unreadCount > 0;
  const muted = isMuted(conv) || !conv.notificationsEnabled;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/messages/[id]', params: { id: conv.id } })}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${conv.unreadCount} unread` : ''}${muted ? ', muted' : ''}${conv.pinned ? ', pinned' : ''}`}
      accessibilityHint="Long press for pin, archive and details"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? cc.raised : 'transparent',
      })}
    >
      <View>
        {conv.kind === 'group' ? (
          <GroupAvatar size={48} />
        ) : (
          <Avatar path={peer?.avatar_path} name={peer?.username ?? '?'} size={48} />
        )}
        {online && (
          <View
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: cc.success,
              borderWidth: 2,
              borderColor: cc.panel,
            }}
            accessibilityLabel="Online"
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            scale
            style={{
              color: cc.text,
              fontSize: 16,
              fontWeight: unread ? '600' : '500',
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {conv.pinned && <Icon name="pin" size={12} color={cc.textSubtle} />}
          {muted && <Icon name="bell-off" size={12} color={cc.textSubtle} />}
          <Text
            mono
            style={{ color: unread ? cc.accent : cc.textSubtle, fontSize: 11, marginLeft: 'auto' }}
          >
            {time}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            scale
            style={{ color: unread ? cc.text : cc.textMuted, fontSize: 14, flex: 1 }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread && (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 5,
                backgroundColor: cc.accent,
              }}
            >
              <Text mono style={{ color: cc.onAccent, fontSize: 11, fontWeight: '500' }}>
                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Inbox() {
  const cc = useCc();
  const insets = useSafeAreaInsets();
  const { userId } = useMe();
  const qc = useQueryClient();
  const { syncAll } = useConnect();
  const inbox = useSecureInbox();
  const nicknames = useNicknames();
  const legacy = useQuery({
    queryKey: qk.conversations,
    queryFn: () => fetchConversations(supabase),
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<Set<string>>(new Set());
  const convs = useMemo(() => inbox.data ?? [], [inbox.data]);
  const previews = usePreviews(convs.map((c) => c.id));

  const directPeers = useMemo(
    () => convs.map((c) => peerOf(c, userId)?.id).filter((x): x is string => !!x),
    [convs, userId],
  );
  // Re-subscribe only when the set of people changes, not on every inbox refetch.
  const peersKey = directPeers.join(',');
  useEffect(
    () => (peersKey ? watchPresence(supabase, peersKey.split(','), setOnline) : undefined),
    [peersKey],
  );

  const shown = convs
    .filter((c) => {
      if (filter === 'archived' ? !c.archived : c.archived) return false;
      if (filter === 'unread' && !c.unreadCount) return false;
      if (filter === 'groups' && c.kind !== 'group') return false;
      if (filter === 'pinned' && !c.pinned) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        conversationTitle(c, userId, nicknames.data).toLowerCase().includes(q) ||
        c.members.some((m) => m.username.includes(q))
      );
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt),
    );

  const actions = (c: SecureConversation) => {
    const set = (patch: Parameters<typeof updateConversationPreferences>[3]) =>
      void updateConversationPreferences(supabase, userId, c.id, patch).then(
        () => qc.invalidateQueries({ queryKey: qk.connect.inbox }),
        () => Alert.alert('Not updated', 'Check your connection and try again.'),
      );
    const opts = [c.pinned ? 'Unpin' : 'Pin', c.archived ? 'Unarchive' : 'Archive', 'Chat details'];
    const run = (i: number) => {
      if (i === 0) set({ pinned: !c.pinned });
      if (i === 1) set({ archived: !c.archived });
      if (i === 2) router.push({ pathname: '/messages/details/[id]', params: { id: c.id } });
    };
    if (Platform.OS === 'ios')
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...opts, 'Cancel'], cancelButtonIndex: opts.length },
        (i) => i < opts.length && run(i),
      );
    else
      Alert.alert(conversationTitle(c, userId, nicknames.data), undefined, [
        ...opts.map((o, i) => ({ text: o, onPress: () => run(i) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: cc.panel, paddingTop: insets.top }}>
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: cc.line,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: cc.text, fontSize: 22, fontWeight: '700', flex: 1 }}
        >
          Chats
        </Text>
        <IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} />
        <IconButton name="edit" label="New chat" onPress={() => router.push('/messages/new')} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isRefetching}
            onRefresh={() => {
              void inbox.refetch();
              void syncAll();
            }}
            tintColor={cc.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: cc.night,
                borderRadius: radii.md,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: cc.lineStrong,
              }}
            >
              <Icon name="search" size={16} color={cc.textSubtle} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={cc.textSubtle}
                accessibilityLabel="Search chats"
                autoCapitalize="none"
                style={{ flex: 1, height: 44, color: cc.text, fontSize: 16 }}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{
                marginTop: 8,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: cc.line,
              }}
              contentContainerStyle={{ gap: 18 }}
              accessibilityRole="tablist"
            >
              {FILTERS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === f }}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: filter === f ? cc.accent : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: filter === f ? cc.text : cc.textMuted,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {f[0]!.toUpperCase() + f.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <ChatRow
            conv={item}
            myId={userId}
            title={conversationTitle(item, userId, nicknames.data)}
            preview={previewText(previews.data?.[item.id], userId)}
            time={listTime(previews.data?.[item.id]?.createdAt ?? item.lastMessageAt)}
            online={item.kind === 'direct' && online.has(peerOf(item, userId)?.id ?? '')}
            onLongPress={() => actions(item)}
          />
        )}
        ListEmptyComponent={
          inbox.isPending ? null : inbox.isError ? (
            <ConnectEmpty
              icon="wifi-off"
              title="Couldn’t load your chats"
              body="Check your connection and pull down to try again."
            />
          ) : (
            <ConnectEmpty
              icon="lock"
              title={filter === 'all' && !query ? 'No conversations yet' : 'Nothing here'}
              body={
                filter === 'all' && !query
                  ? 'Every chat is end-to-end encrypted. Only you and the people you talk to can read it.'
                  : undefined
              }
              action={
                filter === 'all' && !query ? (
                  <PrimaryButton
                    title="New chat"
                    icon="edit"
                    onPress={() => router.push('/messages/new')}
                  />
                ) : undefined
              }
            />
          )
        }
        ListFooterComponent={
          legacy.data?.length && filter === 'all' ? (
            <View style={{ padding: 16, gap: 4 }}>
              <Text style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600' }}>
                Older chats (read-only, not end-to-end encrypted)
              </Text>
              {legacy.data.map((l) => (
                <Pressable
                  key={l.conversation_id}
                  onPress={() =>
                    router.push({
                      pathname: '/messages/legacy/[id]',
                      params: { id: l.conversation_id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Legacy chat with ${l.other_username ?? 'unavailable account'}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}
                >
                  <Avatar path={l.other_avatar_path} name={l.other_username ?? '?'} size={32} />
                  <Text style={{ color: cc.textMuted, flex: 1 }} numberOfLines={1}>
                    {l.other_username ?? 'Unavailable'}
                  </Text>
                  <Icon name="unlock" size={14} color={cc.textSubtle} />
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

export default function MessagesScreen() {
  return (
    <ConnectGate>
      <Inbox />
    </ConnectGate>
  );
}
