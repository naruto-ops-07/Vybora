import {
  fetchConversations,
  isMuted,
  muteUntil,
  peerOf,
  qk,
  updateConversationPreferences,
  watchPresence,
  type SecureConversation,
} from '@vybora/api';
import {
  chatRowPreview,
  formatRowTime,
  formatUnread,
  receiptOf,
  type RowPreview,
} from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  usePreviews,
  useSecureInbox,
} from '@/features/connect/hooks';
import { RowPreviewLine } from '@/features/connect/ui/ChatRowParts';
import { ConnectEmpty, PrimaryButton, useCc } from '@/features/connect/ui/primitives';
import { UndoBar } from '@/features/connect/ui/UndoBar';
import { useHaptics } from '@/lib/haptics';
import { radii } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type Filter = 'all' | 'unread' | 'groups' | 'pinned' | 'archived';
const FILTERS: Filter[] = ['all', 'unread', 'groups', 'pinned', 'archived'];

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
  preview: RowPreview;
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
          <RowPreviewLine preview={preview} unread={unread} />
          {unread && (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 5,
                backgroundColor: muted ? cc.strong : cc.accent,
              }}
            >
              <Text
                mono
                style={{ color: muted ? cc.text : cc.onAccent, fontSize: 11, fontWeight: '500' }}
              >
                {formatUnread(conv.unreadCount)}
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
  const focused = useIsFocused();
  const haptic = useHaptics();
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
                online={c.kind === 'direct' && online.has(peerOf(c, userId)?.id ?? '')}
                onLongPress={() => actions(c)}
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
