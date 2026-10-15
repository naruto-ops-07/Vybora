import { Icon } from '@/components/Icon';
import { fetchConnectPrivacy, isMuted, peerOf, qk, watchPresence } from '@vybora/api';
import { dayLabel, friendlyError, layoutThread, messageSummary, receiptOf } from '@vybora/core';
import { MAX_ATTACHMENT_BYTES, type LocalMessage } from '@vybora/e2ee';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  type ViewToken,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import {
  conversationTitle,
  useConversation,
  useNicknames,
  useSecureMessages,
  useTyping,
} from '@/features/connect/hooks';
import { Bubble } from '@/features/connect/ui/Bubble';
import { Composer } from '@/features/connect/ui/Composer';
import { MessageActions } from '@/features/connect/ui/MessageActions';
import {
  ChatBackground,
  EncryptionBadge,
  effectiveTheme,
  TypingDots,
  useCc,
  useThemeDef,
} from '@/features/connect/ui/primitives';
import { DateChip, JumpToLatest, UnreadDivider } from '@/features/connect/ui/ThreadParts';
import { useA11y } from '@/lib/a11y';
import { radii } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

const TTL_LABEL = (s: number) =>
  s >= 86400 * 7
    ? `${Math.round(s / 604800)}w`
    : s >= 86400
      ? `${Math.round(s / 86400)}d`
      : s >= 3600
        ? `${Math.round(s / 3600)}h`
        : `${Math.round(s / 60)}m`;

async function readBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

function Chat() {
  const cc = useCc();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const { engine } = useConnect();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const conversation = useConversation(id);
  const conv = conversation.data;
  // Older (pre-encryption) chats and their notifications open the legacy screen.
  const isLegacy = conversation.isSuccess && !conversation.isFetching && !conv;
  useEffect(() => {
    if (isLegacy) router.replace({ pathname: '/messages/legacy/[id]', params: { id } });
  }, [isLegacy, id]);
  const nicknames = useNicknames();
  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId),
  });
  const { messages, syncState, live } = useSecureMessages(id, focused);
  const { typingUsers, notifyTyping } = useTyping(id, privacy.data?.typing_indicators ?? true);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [selected, setSelected] = useState<LocalMessage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);

  const theme = effectiveTheme(
    conv?.theme ?? {},
    conv?.localTheme ?? null,
    conv?.useLocalTheme ?? false,
  );
  const def = useThemeDef(theme);
  const peer = conv ? peerOf(conv, userId) : null;
  const title = conv ? conversationTitle(conv, userId, nicknames.data) : '';
  const nameOf = useCallback(
    (uid: string) => {
      if (uid === userId) return 'You';
      const m = conv?.members.find((x) => x.id === uid);
      return nicknames.data?.[uid] ?? m?.display_name ?? m?.username ?? 'Someone';
    },
    [conv, nicknames.data, userId],
  );

  const peerId = peer?.id;
  useEffect(
    () => (peerId ? watchPresence(supabase, [peerId], (s) => setOnline(s.has(peerId))) : undefined),
    [peerId],
  );

  // Safety-number change warning (direct chats).
  const keys = useQuery({
    queryKey: qk.connect.keys(peer?.id ?? ''),
    enabled: !!engine && !!peer,
    queryFn: () => engine!.checkContactKeys(peer!.id),
  });

  const ordered = useMemo(
    () =>
      [...(messages.data ?? [])].sort(
        (a, b) =>
          (b.seq ?? Number.MAX_SAFE_INTEGER) - (a.seq ?? Number.MAX_SAFE_INTEGER) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [messages.data],
  );

  // The unread divider uses the read position from when the chat was opened,
  // so it neither vanishes when the messages are acknowledged nor grows when
  // new ones arrive live.
  const [readMark, setReadMark] = useState<{ id: string; seq: number; until: number } | null>(null);
  useEffect(() => {
    if (conv && readMark?.id !== id)
      setReadMark({ id, seq: conv.lastReadSeq, until: conv.lastSeq });
  }, [conv, id, readMark?.id]);
  const rows = useMemo(
    () =>
      layoutThread([...ordered].reverse(), {
        myUserId: userId,
        lastReadSeq: readMark?.id === id ? readMark.seq : Number.MAX_SAFE_INTEGER,
        unreadUntilSeq: readMark?.id === id ? readMark.until : undefined,
        now: new Date(),
      }).reverse(),
    [ordered, userId, readMark, id],
  );

  const { reduceMotion } = useA11y();
  const list = useRef<FlatList<(typeof rows)[number]>>(null);
  const [floatingDay, setFloatingDay] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The floating chip only follows the finger: viewability also fires on first
  // layout, after programmatic scrolls and when live messages arrive.
  const scrolling = useRef(false);
  const reduceRef = useRef(reduceMotion);
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);
  const [away, setAway] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const lastSeenSeq = useRef(0);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Inverted list: the highest index on screen is the oldest (top) row.
    const top = viewableItems.reduce<ViewToken | null>(
      (a, b) => ((b.index ?? 0) > (a?.index ?? -1) ? b : a),
      null,
    );
    const item = top?.item as (typeof rows)[number] | undefined;
    if (!item || !scrolling.current) return;
    const label =
      item.type === 'message'
        ? dayLabel(item.message.createdAt, new Date())
        : item.type === 'date'
          ? item.label
          : null;
    if (!label) return;
    setFloatingDay(label);
    fade.stopAnimation();
    if (reduceRef.current) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }).current;
  const beginScroll = useRef(() => {
    scrolling.current = true;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }).current;
  const endScroll = useRef(() => {
    scrolling.current = false;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      fade.stopAnimation();
      if (reduceRef.current) {
        fade.setValue(0);
        setFloatingDay(null);
      } else
        Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(
          ({ finished }) => finished && setFloatingDay(null),
        );
    }, 1500);
  }).current;
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  useEffect(() => {
    lastSeenSeq.current = 0;
    setNewCount(0);
    scrolling.current = false;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    fade.setValue(0);
    setFloatingDay(null);
  }, [id, fade]);
  useEffect(() => {
    const newest = ordered[0]?.seq ?? 0;
    if (!away || !lastSeenSeq.current) {
      lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
      setNewCount(0);
      return;
    }
    // Only newer messages from others count; older pages (lower seq) and my own never do.
    const fresh = ordered.filter(
      (m) => (m.seq ?? 0) > lastSeenSeq.current && m.senderId !== userId,
    ).length;
    if (fresh) setNewCount((c) => c + fresh);
    lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
  }, [ordered, userId, away]);

  const announced = useRef<{ conv: string; id: string } | null>(null);
  useEffect(() => {
    if (!messages.isSuccess) return;
    const newest = ordered.find((m) => m.senderId !== userId);
    if (announced.current?.conv !== id) {
      announced.current = { conv: id, id: newest?.id ?? '' };
      return;
    }
    if (!newest || newest.id === announced.current.id) return;
    announced.current = { conv: id, id: newest.id };
    const muted = conv ? isMuted(conv) || !conv.notificationsEnabled : true;
    if (!muted)
      AccessibilityInfo.announceForAccessibility(
        `${nameOf(newest.senderId)}: ${messageSummary(newest)}`,
      );
  }, [ordered, messages.isSuccess, userId, id, conv, nameOf]);

  // Open at the unread divider once per chat.
  const positioned = useRef<string | null>(null);
  useEffect(() => {
    if (positioned.current === id || readMark?.id !== id || !rows.length) return;
    positioned.current = id;
    const index = rows.findIndex((r) => r.type === 'unread');
    if (index > 0) list.current?.scrollToIndex({ index, viewPosition: 1, animated: false });
  }, [rows, id, readMark]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'not_ready')
        Alert.alert(
          'Secure session not ready',
          'This device is waiting to be added to the conversation. Try again in a moment.',
        );
      else if (code !== 'network') Alert.alert('Message not sent', friendlyError(e));
    }
  };

  const reply = replyTo
    ? {
        id: replyTo.id,
        senderId: replyTo.senderId,
        preview:
          replyTo.kind === 'text'
            ? (replyTo.body ?? '').slice(0, 140)
            : replyTo.attachment?.kind === 'voice'
              ? 'Voice message'
              : 'Attachment',
        name: nameOf(replyTo.senderId),
      }
    : null;

  const sendText = (body: string) => {
    const r = reply
      ? { id: reply.id, senderId: reply.senderId, preview: reply.preview }
      : undefined;
    setReplyTo(null);
    void run(() => engine!.send(id, { t: 'text', body, replyTo: r }));
  };

  const sendFile = async (
    bytes: Uint8Array,
    meta: Parameters<NonNullable<typeof engine>['sendAttachment']>[2],
  ) => {
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      Alert.alert('File too large', 'Attachments can be up to 25 MB.');
      return;
    }
    setBusy(true);
    await run(() => engine!.sendAttachment(id, bytes, meta));
    setBusy(false);
  };

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted)
      return Alert.alert(
        'Photos access is off',
        'Allow photo library access in Settings to share photos and videos.',
      );
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const isVideo = a.type === 'video';
    await sendFile(await readBytes(a.uri), {
      kind: isVideo ? 'video' : 'image',
      mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      width: a.width || undefined,
      height: a.height || undefined,
      durationMs: a.duration ? Math.round(a.duration) : undefined,
    });
  };

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    await sendFile(await readBytes(a.uri), {
      kind: 'file',
      mime: a.mimeType ?? 'application/octet-stream',
      name: a.name.slice(0, 200),
    });
  };

  const attach = () => {
    const opts = ['Photo or video', 'File'];
    const pick = (i: number) => void (i === 0 ? pickMedia() : pickDocument());
    if (Platform.OS === 'ios')
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...opts, 'Cancel'], cancelButtonIndex: 2 },
        (i) => i < 2 && pick(i),
      );
    else
      Alert.alert('Share securely', undefined, [
        ...opts.map((o, i) => ({ text: o, onPress: () => pick(i) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
  };

  const sendVoice = async (uri: string, durationMs: number) => {
    await sendFile(await readBytes(uri), { kind: 'voice', mime: 'audio/mp4', durationMs });
  };

  const typingNames = typingUsers.map(nameOf);
  const subtitle = typingNames.length
    ? `${typingNames.join(', ')} typing…`
    : conv?.kind === 'group'
      ? `${conv.members.length} members`
      : online
        ? 'Online'
        : 'End-to-end encrypted';
  const composerDisabled = syncState === 'waiting_for_access' || syncState === 'broken';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: def.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: cc.panel },
          headerTintColor: cc.text,
          headerTitle: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/messages/details/[id]', params: { id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`${title}, chat details`}
            >
              {conv?.kind === 'group' ? (
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: cc.strong,
                  }}
                >
                  <Icon name="users" size={16} color={cc.accent} />
                </View>
              ) : (
                <Avatar path={peer?.avatar_path} name={peer?.username ?? '?'} size={34} />
              )}
              <View>
                <Text style={{ color: cc.text, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
                  {title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {typingNames.length ? (
                    <TypingDots color={def.accent} />
                  ) : (
                    <Icon
                      name={online ? 'circle' : 'lock'}
                      size={9}
                      color={online ? cc.success : cc.textSubtle}
                    />
                  )}
                  <Text
                    mono
                    style={{ color: typingNames.length ? def.accent : cc.textSubtle, fontSize: 11 }}
                  >
                    {subtitle}
                  </Text>
                </View>
              </View>
            </Pressable>
          ),
          headerRight: () =>
            conv?.disappearingSeconds ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                accessibilityLabel="Disappearing messages on"
              >
                <Icon name="timer" size={15} color={cc.textMuted} />
                <Text mono style={{ color: cc.textMuted, fontSize: 12 }}>
                  {TTL_LABEL(conv.disappearingSeconds)}
                </Text>
              </View>
            ) : null,
        }}
      />
      <ChatBackground theme={theme}>
        {!live && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 6,
              backgroundColor: cc.dark ? '#2A2110' : '#FDF3E2',
            }}
            accessibilityLiveRegion="polite"
          >
            <Icon name="wifi-off" size={12} color={cc.warning} />
            <Text style={{ color: cc.warning, fontSize: 12 }}>
              Reconnecting — messages will sync automatically
            </Text>
          </View>
        )}
        {keys.data?.status === 'changed' && peer && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/messages/verify/[userId]',
                params: { userId: peer.id, conversationId: id },
              })
            }
            style={{
              margin: 10,
              padding: 12,
              borderRadius: radii.md,
              backgroundColor: cc.dark ? '#2A2110' : '#FDF3E2',
              borderWidth: 1,
              borderColor: cc.warning,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <Icon name="alert-triangle" size={16} color={cc.warning} />
            <Text style={{ color: cc.text, flex: 1, fontSize: 13 }}>
              {nameOf(peer.id)}’s safety number changed — they may have a new device. Tap to verify.
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <FlatList
            ref={list}
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={{ paddingVertical: 12 }}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement } = e.nativeEvent;
              setAway(contentOffset.y > layoutMeasurement.height);
            }}
            scrollEventThrottle={100}
            onScrollBeginDrag={beginScroll}
            onMomentumScrollBegin={beginScroll}
            onScrollEndDrag={endScroll}
            onMomentumScrollEnd={endScroll}
            onScrollToIndexFailed={(info) =>
              list.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              })
            }
            renderItem={({ item }) => {
              if (item.type === 'date') return <DateChip label={item.label} />;
              if (item.type === 'unread') return <UnreadDivider count={item.count} />;
              const m = item.message;
              const group = conv?.kind === 'group';
              const sender = conv?.members.find((x) => x.id === m.senderId);
              return (
                <Bubble
                  message={m}
                  mine={item.mine}
                  theme={def}
                  senderName={group ? nameOf(m.senderId) : undefined}
                  showSender={!!group && item.runStart}
                  runStart={item.runStart}
                  runEnd={item.runEnd}
                  avatar={
                    group && !item.mine
                      ? { path: sender?.avatar_path ?? null, name: sender?.username ?? '?' }
                      : undefined
                  }
                  receipt={receiptOf(m, userId, conv?.members ?? [])}
                  onLongPress={setSelected}
                  onRetry={(x) => void run(() => engine!.retry(id, x.id))}
                  onOpenImage={setViewer}
                  nameOf={nameOf}
                />
              );
            }}
            ListFooterComponent={
              <View style={{ paddingVertical: 18, gap: 8, alignItems: 'center' }}>
                <EncryptionBadge />
                <Text
                  style={{
                    color: cc.textSubtle,
                    fontSize: 12,
                    textAlign: 'center',
                    paddingHorizontal: 40,
                  }}
                >
                  Messages and attachments are secured with end-to-end encryption (MLS). Not even
                  VYBORA can read them.
                </Text>
              </View>
            }
            ListEmptyComponent={
              messages.isPending || syncState === 'syncing' ? (
                <View style={{ padding: 30, transform: [{ scaleY: -1 }] }}>
                  <ActivityIndicator color={def.accent} />
                </View>
              ) : null
            }
          />
          {floatingDay && (
            <Animated.View
              style={{ position: 'absolute', top: 8, left: 0, right: 0, opacity: fade }}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <DateChip label={floatingDay} floating />
            </Animated.View>
          )}
          {away && (
            <JumpToLatest
              count={newCount}
              onPress={() => {
                setNewCount(0);
                list.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
              }}
            />
          )}
        </View>
        {busy && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 8,
            }}
          >
            <ActivityIndicator size="small" color={def.accent} />
            <Text style={{ color: cc.textMuted, fontSize: 12 }}>Encrypting and uploading…</Text>
          </View>
        )}
        <View style={{ paddingBottom: insets.bottom }}>
          <Composer
            accent={def.accent}
            disabled={composerDisabled}
            disabledReason={
              syncState === 'broken'
                ? 'This device lost its secure session for this chat. Another member’s device will re-add it automatically.'
                : 'Setting up encryption on this device. A member’s device adds it automatically when they’re online.'
            }
            replyTo={reply}
            onCancelReply={() => setReplyTo(null)}
            onSend={sendText}
            onAttach={attach}
            onVoice={(uri, ms) => void sendVoice(uri, ms)}
            onTyping={notifyTyping}
          />
        </View>
      </ChatBackground>

      <MessageActions
        message={selected}
        mine={selected?.senderId === userId}
        myReaction={
          selected
            ? (Object.entries(selected.reactions).find(([, u]) => u.includes(userId))?.[0] ?? null)
            : null
        }
        onClose={() => setSelected(null)}
        onReact={(emoji) => {
          const m = selected!;
          const mine = m.reactions[emoji]?.includes(userId);
          setSelected(null);
          void run(() => engine!.send(id, { t: 'reaction', target: m.id, emoji, remove: mine }));
        }}
        onReply={() => {
          setReplyTo(selected);
          setSelected(null);
        }}
        onCopy={() => {
          void Clipboard.setStringAsync(selected?.body ?? '');
          setSelected(null);
        }}
        onDelete={() => {
          const m = selected!;
          setSelected(null);
          Alert.alert(
            'Delete for everyone?',
            'This removes the message on every device in this chat.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void run(() => engine!.send(id, { t: 'delete', target: m.id })),
              },
            ],
          );
        }}
      />

      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}
          onPress={() => setViewer(null)}
          accessibilityLabel="Close photo"
        >
          {viewer && (
            <Image
              source={{ uri: viewer }}
              style={{ width: '100%', height: '80%' }}
              contentFit="contain"
            />
          )}
          <View style={{ position: 'absolute', top: insets.top + 12, right: 16 }}>
            <Icon name="x" size={26} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

export default function ChatScreen() {
  return (
    <ConnectGate>
      <Chat />
    </ConnectGate>
  );
}
