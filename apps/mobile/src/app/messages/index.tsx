import {
  fetchConversations,
  isMuted,
  muteUntil,
  peerOf,
  qk,
  updateConversationPreferences,
  type SecureConversation,
} from '@vybora/api';
import {
  chatListEmptyState,
  chatRowPreview,
  formatRowTime,
  receiptOf,
  usernameFromAddParam,
} from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { Text, TextInput } from '@/components/Text';
import { Avatar, IconButton } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import {
  conversationTitle,
  useInboxTyping,
  useNicknames,
  useOnlinePeers,
  usePreviews,
  useSecureInbox,
} from '@/features/connect/hooks';
import { ChatRow } from '@/features/connect/ui/ChatRowParts';
import { ConnectEmpty, PrimaryIconButton, useCc } from '@/features/connect/ui/primitives';
import { UndoBar } from '@/features/connect/ui/UndoBar';
import { FriendsButton } from '@/features/friends/FriendsButton';
import { useShareMyHandle } from '@/features/friends/HandleCard';
import { useFriendRequests, useFriends, useMessageFriend } from '@/features/friends/hooks';
import {
  AddFriendButton,
  addFriend,
  ChatListEmptyView,
  NoResultsEmpty,
} from '@/features/onboarding/EmptyStates';
import { GetStarted } from '@/features/onboarding/GetStarted';
import { useHaptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type Filter = 'all' | 'unread' | 'groups' | 'pinned' | 'archived';
const FILTERS: Filter[] = ['all', 'unread', 'groups', 'pinned', 'archived'];

/** The chat list before the first chat: which state comes from the shared rule. */
function ChatListEmpty() {
  const friends = useFriends();
  const focused = useIsFocused();
  const requests = useFriendRequests(focused);
  const message = useMessageFriend();
  const share = useShareMyHandle();
  const outgoingCount = requests.data?.outgoing.length ?? 0;
  // A failed friends query still shows "say hi" (without avatars), not "no friends".
  const state = friends.isError
    ? 'say-hi'
    : chatListEmptyState({
        friendsLoaded: friends.isSuccess && !requests.isPending,
        friendCount: friends.data?.length ?? 0,
        outgoingCount,
      });
  return (
    <ChatListEmptyView
      state={state}
      outgoingCount={outgoingCount}
      friends={friends.data ?? []}
      onFindFriends={() => addFriend()}
      onShare={() => void share()}
      onSayHi={message.open}
      onNewMessage={() => router.push('/messages/new')}
    />
  );
}

/** The empty state for the chat list, a search that found no one, or an empty filter. */
function InboxEmpty({
  term,
  filter,
  hasChats,
}: {
  term: string;
  filter: Filter;
  hasChats: boolean;
}) {
  const cc = useCc();
  if (term)
    return (
      <NoResultsEmpty
        action={<AddFriendButton username={usernameFromAddParam(term)} variant="outline" />}
      />
    );
  if (filter === 'all' && !hasChats) return <ChatListEmpty />;
  return (
    <Text
      style={{
        color: cc.textMuted,
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 32,
        paddingVertical: 48,
      }}
    >
      {filter === 'all' ? 'No chats here' : `No ${filter} chats`}
    </Text>
  );
}

function Inbox() {
  const { radii } = useTheme();
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
  const convs = useMemo(() => inbox.data ?? [], [inbox.data]);
  const previews = usePreviews(convs.map((c) => c.id));
  const focused = useIsFocused();
  const haptic = useHaptics();
  const requests = useFriendRequests(focused);
  const [undo, setUndo] = useState<{ id: number; message: string; run: () => void } | null>(null);
  const recentIds = useMemo(
    () =>
      [...convs]
        .filter((c) => !c.archived)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .slice(0, 20)
        .map((c) => c.id),
    [convs],
  );
  // Leave the typing channels while a chat is open on top (it joins its own).
  const typing = useInboxTyping(recentIds, focused);
  const dismissUndo = useCallback(() => setUndo(null), []);

  const directPeers = useMemo(
    () => convs.map((c) => peerOf(c, userId)?.id).filter((x): x is string => !!x),
    [convs, userId],
  );
  const shownOnline = useOnlinePeers(directPeers);

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

  const memberName = (c: SecureConversation, uid: string) => {
    const m = c.members.find((x) => x.id === uid);
    return nicknames.data?.[uid] ?? m?.display_name ?? m?.username ?? 'Someone';
  };
  const setPrefs = (
    c: SecureConversation,
    patch: Parameters<typeof updateConversationPreferences>[3],
  ) =>
    void updateConversationPreferences(supabase, userId, c.id, patch).then(
      () => qc.invalidateQueries({ queryKey: qk.connect.inbox }),
      () => Alert.alert('Not updated', 'Check your connection and try again.'),
    );
  const archive = (c: SecureConversation) => {
    const next = !c.archived;
    setPrefs(c, { archived: next });
    if (next)
      setUndo({
        id: Date.now(),
        message: 'Archived',
        run: () => setPrefs(c, { archived: false }),
      });
  };

  const actions = (c: SecureConversation) => {
    haptic('medium');
    const muted = isMuted(c);
    const opts = [
      c.pinned ? 'Unpin' : 'Pin',
      muted ? 'Unmute' : 'Mute for 8 hours',
      c.archived ? 'Unarchive' : 'Archive',
      'Chat details',
    ];
    const run = (i: number) => {
      if (i === 0) setPrefs(c, { pinned: !c.pinned });
      if (i === 1) setPrefs(c, { muted_until: muted ? null : muteUntil('8h') });
      if (i === 2) archive(c);
      if (i === 3) router.push({ pathname: '/messages/details/[id]', params: { id: c.id } });
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
    <View style={{ flex: 1, backgroundColor: cc.night }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: cc.bar,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: cc.highContrast ? cc.lineStrong : cc.line,
        }}
      >
        <View
          style={{
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            paddingLeft: 20,
            paddingRight: 10,
          }}
        >
          <Text
            accessibilityRole="header"
            display
            style={{
              color: cc.text,
              fontSize: 28,
              fontWeight: '600',
              letterSpacing: -0.4,
              flex: 1,
            }}
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
          >
            Chats
          </Text>
          <FriendsButton
            count={requests.data?.incoming.length ?? 0}
            onPress={() => router.push('/messages/friends')}
          />
          <IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} />
          <View style={{ marginLeft: 4 }}>
            <PrimaryIconButton
              icon="edit"
              label="New chat"
              onPress={() => router.push('/messages/new')}
            />
          </View>
        </View>
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
          <View>
            <GetStarted
              previews={previews.data}
              previewsReady={inbox.isSuccess && (convs.length === 0 || previews.isSuccess)}
            />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: cc.raised,
                  borderRadius: radii.md,
                  paddingHorizontal: 14,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: cc.highContrast ? cc.lineStrong : cc.line,
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
                style={{ marginTop: 10, marginHorizontal: -16 }}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
                accessibilityRole="tablist"
              >
                {FILTERS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filter === f }}
                    // A 34 px pill inside a 44 px target (web `.vy-chip`).
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        minHeight: 34,
                        justifyContent: 'center',
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: filter === f ? cc.accent : cc.panel,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor:
                          filter === f ? cc.accent : cc.highContrast ? cc.lineStrong : cc.line,
                      }}
                    >
                      <Text
                        style={{
                          color: filter === f ? cc.onAccent : cc.textMuted,
                          fontSize: 14,
                          fontWeight: '500',
                        }}
                      >
                        {f[0]!.toUpperCase() + f.slice(1)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        }
        renderItem={({ item: c }) => {
          const last = previews.data?.[c.id];
          const preview = chatRowPreview(last, {
            myUserId: userId,
            isGroup: c.kind === 'group',
            typingUserIds: typing[c.id] ?? [],
            nameOf: (uid) => memberName(c, uid),
            receipt: last ? receiptOf(last, userId, c.members) : undefined,
          });
          const muted = isMuted(c);
          const action = (
            label: string,
            icon: IconName,
            onPress: () => void,
            bg: string,
            close: () => void,
          ) => (
            <Pressable
              key={label}
              onPress={() => {
                close();
                onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={{
                width: 72,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: bg,
              }}
            >
              <Icon name={icon} size={20} color={cc.text} />
              <Text style={{ color: cc.text, fontSize: 12 }}>{label}</Text>
            </Pressable>
          );
          return (
            <ReanimatedSwipeable
              friction={2}
              rightThreshold={40}
              overshootRight={false}
              onSwipeableWillOpen={() => haptic('light')}
              renderRightActions={(_progress, _translation, methods) => (
                <View style={{ flexDirection: 'row' }}>
                  {action(
                    c.pinned ? 'Unpin' : 'Pin',
                    'pin',
                    () => setPrefs(c, { pinned: !c.pinned }),
                    cc.raised,
                    methods.close,
                  )}
                  {action(
                    muted ? 'Unmute' : 'Mute',
                    muted ? 'bell' : 'bell-off',
                    () => setPrefs(c, { muted_until: muted ? null : muteUntil('8h') }),
                    cc.strong,
                    methods.close,
                  )}
                  {action(
                    c.archived ? 'Unarchive' : 'Archive',
                    'archive',
                    () => archive(c),
                    cc.lineStrong,
                    methods.close,
                  )}
                </View>
              )}
            >
              <ChatRow
                conv={c}
                myId={userId}
                title={conversationTitle(c, userId, nicknames.data)}
                preview={preview}
                time={formatRowTime(last?.createdAt ?? c.lastMessageAt, new Date())}
                online={c.kind === 'direct' && shownOnline.has(peerOf(c, userId)?.id ?? '')}
                onPress={() => router.push({ pathname: '/messages/[id]', params: { id: c.id } })}
                onLongPress={() => actions(c)}
                onTogglePin={() => setPrefs(c, { pinned: !c.pinned })}
                onToggleMute={() => setPrefs(c, { muted_until: muted ? null : muteUntil('8h') })}
                onArchive={() => archive(c)}
              />
            </ReanimatedSwipeable>
          );
        }}
        ListEmptyComponent={
          inbox.isPending ? null : inbox.isError ? (
            <ConnectEmpty
              icon="wifi-off"
              title="Couldn’t load your chats"
              body="Check your connection and pull down to try again."
            />
          ) : (
            <InboxEmpty term={query.trim()} filter={filter} hasChats={convs.length > 0} />
          )
        }
        ListFooterComponent={
          legacy.data?.length && filter === 'all' ? (
            <View style={{ padding: 16, gap: 4 }}>
              <Text
                style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600', paddingBottom: 4 }}
              >
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
                  <Avatar
                    path={l.other_avatar_path}
                    name={l.other_username ?? '?'}
                    userId={l.other_id ?? l.conversation_id}
                    displayName={l.other_display_name}
                    size={32}
                  />
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
      {undo && (
        <UndoBar
          key={undo.id}
          message={undo.message}
          onUndo={() => {
            undo.run();
            setUndo(null);
          }}
          onDone={dismissUndo}
        />
      )}
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
