import { Icon } from '@/components/Icon';
import {
  block,
  fetchContactPhone,
  groupAdmin,
  isMuted,
  MESSAGE_TONES,
  muteUntil,
  peerOf,
  qk,
  reportContent,
  searchProfiles,
  setDisappearing,
  setNickname,
  setSharedTheme,
  updateConversationPreferences,
  WALLPAPERS,
  type ChatTheme,
  type MessageTone,
  type PreferencePatch,
  type ThemePreset,
} from '@vybora/api';
import {
  chatAccent,
  chatThemeDefs,
  DEFAULT_THEME_PRESET,
  THEME_ORDER,
  toneLabels,
  wallpaperLabels,
  wallpaperSvg,
} from '@vybora/config';
import { friendlyError, tokenizeText } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { Text, TextInput } from '@/components/Text';
import { SvgXml } from 'react-native-svg';
import { Avatar } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import { conversationTitle, useConversation, useNicknames } from '@/features/connect/hooks';
import { ImageAttachment } from '@/features/connect/ui/Attachment';
import { Row, SectionCard, useCc } from '@/features/connect/ui/primitives';
import { radii } from '@/lib/theme';
import { playTone } from '@/lib/connect/tones';
import { supabase } from '@/lib/supabase';

const DISAPPEARING: { label: string; seconds: number | null }[] = [
  { label: 'Off', seconds: null },
  { label: '5 minutes', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '1 week', seconds: 604800 },
];

function ThemePicker({ value, onPick }: { value: ChatTheme; onPick: (t: ChatTheme) => void }) {
  const cc = useCc();
  const preset = value.preset ?? DEFAULT_THEME_PRESET;
  const accent = chatAccent(chatThemeDefs[preset] ?? chatThemeDefs[DEFAULT_THEME_PRESET]!, cc.dark);
  return (
    <View style={{ padding: 14, gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: cc.textMuted, fontSize: 12, fontWeight: '500' }}>Colour</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          accessibilityRole="radiogroup"
        >
          {THEME_ORDER.map((p) => {
            const d = chatThemeDefs[p]!;
            const active = preset === p;
            return (
              <Pressable
                key={p}
                onPress={() => onPick({ ...value, preset: p as ThemePreset })}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={` theme`}
                style={{
                  width: '23%',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: active ? cc.accent : cc.line,
                  backgroundColor: active ? cc.accentSoft : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radii.sm,
                    backgroundColor: d.bubble,
                  }}
                />
                <Text style={{ color: cc.text, fontSize: 11 }}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: cc.textMuted, fontSize: 12, fontWeight: '500' }}>Wallpaper</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          accessibilityRole="radiogroup"
        >
          {WALLPAPERS.map((w) => {
            const svg = wallpaperSvg(w, accent);
            const active = (value.wallpaper ?? 'none') === w;
            return (
              <Pressable
                key={w}
                onPress={() => onPick({ ...value, wallpaper: w })}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={` wallpaper`}
                style={{ width: '23%', alignItems: 'center', gap: 4 }}
              >
                <View
                  style={{
                    width: '100%',
                    height: 64,
                    borderRadius: radii.md,
                    overflow: 'hidden',
                    backgroundColor: cc.night,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? cc.accent : cc.line,
                  }}
                >
                  {svg && <SvgXml xml={svg} width="100%" height="100%" />}
                </View>
                <Text style={{ color: active ? cc.text : cc.textMuted, fontSize: 11 }}>
                  {wallpaperLabels[w]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
function Details() {
  const cc = useCc();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const { engine } = useConnect();
  const qc = useQueryClient();
  const conv = useConversation(id).data;
  const nicknames = useNicknames();
  const [nickDraft, setNickDraft] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<ChatTheme | null>(null);
  const [localDraft, setLocalDraft] = useState<ChatTheme | null>(null);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const peer = conv ? peerOf(conv, userId) : null;
  const phone = useQuery({
    queryKey: qk.connect.phone(peer?.id ?? ''),
    enabled: !!peer,
    queryFn: () => fetchContactPhone(supabase, peer!.id),
  });
  const media = useQuery({
    queryKey: ['connect', 'media', id],
    enabled: !!engine,
    queryFn: () => engine!.listMessages(id, { limit: 500 }),
  });
  const search = useQuery({
    queryKey: qk.search(q),
    enabled: adding && q.length > 0,
    queryFn: () => searchProfiles(supabase, q),
  });

  if (!conv) return <View style={{ flex: 1, backgroundColor: cc.night }} />;
  const isAdmin = conv.myRole === 'admin';
  const canEdit = conv.settingsPolicy === 'everyone' || isAdmin;
  const title = conversationTitle(conv, userId, nicknames.data);
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.connect.inbox });
  const fail = (e: unknown) => {
    const m = (e as { message?: string }).message ?? '';
    Alert.alert(
      'Not saved',
      m.includes('theme_conflict')
        ? 'Someone just changed the theme. Reopen to see the latest and try again.'
        : m.includes('admins_only')
          ? 'Only group admins can change this.'
          : friendlyError(e),
    );
  };
  const prefs = (patch: PreferencePatch) =>
    updateConversationPreferences(supabase, userId, id, patch).then(refresh, fail);

  const images = (media.data ?? []).filter(
    (m): m is LocalMessage & { attachment: NonNullable<LocalMessage['attachment']> } =>
      m.kind === 'attachment' && !m.deleted && m.attachment?.kind === 'image',
  );
  const files = (media.data ?? []).filter(
    (m) => m.kind === 'attachment' && !m.deleted && m.attachment?.kind !== 'image',
  ).length;
  const links = (media.data ?? [])
    .flatMap((m) => (m.body ? tokenizeText(m.body) : []))
    .flatMap((t) => (t.type === 'url' ? [t] : []))
    .slice(-6);

  const mute = () =>
    Alert.alert('Mute notifications', 'You’ll still receive every message.', [
      ...(['1h', '8h', '1w', 'always'] as const).map((d) => ({
        text: {
          '1h': 'For 1 hour',
          '8h': 'For 8 hours',
          '1w': 'For 1 week',
          always: 'Until I turn it back on',
        }[d],
        onPress: () => void prefs({ muted_until: muteUntil(d) }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const pickTone = () =>
    Alert.alert(
      'Message tone',
      'Plays in VYBORA for this chat. Push sounds follow this choice on builds that include custom sounds.',
      [
        ...MESSAGE_TONES.map((t: MessageTone) => ({
          text: `${toneLabels[t]}${conv.tone === t ? '  ✓' : ''}`,
          onPress: () => {
            void playTone(t);
            void prefs({ tone: t });
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  const applySharedTheme = () => {
    const next = themeDraft!;
    Alert.alert(
      'Change theme for everyone?',
      `Everyone in “${title}” will see this theme and wallpaper on all their devices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply for everyone',
          onPress: () =>
            void setSharedTheme(supabase, id, next, conv.themeVersion).then(() => {
              setThemeDraft(null);
              refresh();
            }, fail),
        },
      ],
    );
  };

  const setTtl = () =>
    Alert.alert(
      'Disappearing messages',
      'New messages will disappear for everyone after the selected time.',
      [
        ...DISAPPEARING.map((o) => ({
          text: `${o.label}${conv.disappearingSeconds === o.seconds ? '  ✓' : ''}`,
          onPress: () => void setDisappearing(supabase, id, o.seconds).then(refresh, fail),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  const memberActions = (m: (typeof conv.members)[number]) => {
    if (m.id === userId) return;
    Alert.alert(nicknames.data?.[m.id] ?? m.username, undefined, [
      {
        text: 'View profile',
        onPress: () => router.push({ pathname: '/u/[username]', params: { username: m.username } }),
      },
      {
        text: 'Verify safety number',
        onPress: () =>
          router.push({
            pathname: '/messages/verify/[userId]',
            params: { userId: m.id, conversationId: id },
          }),
      },
      ...(isAdmin
        ? [
            {
              text: m.role === 'admin' ? 'Remove as admin' : 'Make admin',
              onPress: () =>
                void groupAdmin
                  .setRole(supabase, id, m.id, m.role === 'admin' ? 'member' : 'admin')
                  .then(refresh, fail),
            },
            {
              text: 'Remove from group',
              style: 'destructive' as const,
              onPress: () =>
                void groupAdmin.removeMember(supabase, id, m.id).then(() => {
                  refresh();
                  void engine?.sync(id);
                }, fail),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cc.night }}
      contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 60 }}
    >
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: cc.night },
          headerTintColor: cc.text,
        }}
      />
      <View style={{ alignItems: 'center', gap: 8 }}>
        {conv.kind === 'group' ? (
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: cc.strong,
            }}
          >
            <Icon name="users" size={36} color={cc.accent} />
          </View>
        ) : (
          <Avatar
            path={peer?.avatar_path}
            name={peer?.username ?? '?'}
            userId={peer?.id ?? ''}
            displayName={peer?.display_name}
            size={80}
          />
        )}
        <Text style={{ color: cc.text, fontSize: 20, fontWeight: '600' }}>{title}</Text>
        {peer && (
          <Text style={{ color: cc.textMuted }}>
            @{peer.username}
            {nicknames.data?.[peer.id] ? ` · ${peer.display_name || peer.username}` : ''}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="lock" size={12} color={cc.accent} />
          <Text style={{ color: cc.accent, fontSize: 12 }}>End-to-end encrypted · MLS</Text>
        </View>
      </View>

      {conv.kind === 'direct' && peer && (
        <SectionCard
          title="Contact"
          footer="Nicknames are private: only you see them, and they never change the other person’s profile."
        >
          <Row
            icon="edit-3"
            label="Nickname"
            value={nicknames.data?.[peer.id] ?? 'Add'}
            onPress={() => setNickDraft(nicknames.data?.[peer.id] ?? '')}
          />
          {phone.data ? (
            <Row
              icon="phone"
              label="Phone"
              value={phone.data}
              onPress={() =>
                Alert.alert(`Call ${phone.data}?`, 'This opens your phone app.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Call', onPress: () => void Linking.openURL(`tel:${phone.data}`) },
                ])
              }
            />
          ) : (
            <Row
              icon="phone-off"
              label="Phone"
              value="Not shared"
              description="Only shown if they choose to share it with contacts."
            />
          )}
          <Row
            icon="user"
            label="View profile"
            onPress={() =>
              router.push({ pathname: '/u/[username]', params: { username: peer.username } })
            }
          />
        </SectionCard>
      )}

      <SectionCard
        title="Notifications"
        footer="Muting or turning off notifications never blocks or deletes messages."
      >
        <Row
          icon="bell"
          label="Notifications"
          right={
            <Switch
              value={conv.notificationsEnabled}
              onValueChange={(v) => void prefs({ notifications_enabled: v })}
              trackColor={{ true: cc.accent }}
              accessibilityLabel="Notifications for this chat"
            />
          }
        />
        <Row
          icon="bell-off"
          label="Mute"
          value={
            isMuted(conv)
              ? conv.mutedUntil === 'infinity'
                ? 'Always'
                : `Until ${new Date(conv.mutedUntil!).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
              : 'Off'
          }
          onPress={() => (isMuted(conv) ? void prefs({ muted_until: null }) : mute())}
          description={isMuted(conv) ? 'Tap to unmute' : undefined}
        />
        <Row icon="music" label="Message tone" value={toneLabels[conv.tone]} onPress={pickTone} />
      </SectionCard>

      <SectionCard
        title="Chat theme"
        footer={
          canEdit
            ? 'Shared themes are visible to everyone in this chat. Changes never touch messages or encryption keys.'
            : 'Only group admins can change the shared theme.'
        }
      >
        <ThemePicker
          value={themeDraft ?? conv.theme}
          onPick={(t) => (canEdit ? setThemeDraft(t) : undefined)}
        />
        {themeDraft && (
          <View style={{ flexDirection: 'row', gap: 10, padding: 14, paddingTop: 0 }}>
            <Pressable
              onPress={() => setThemeDraft(null)}
              style={{
                flex: 1,
                height: 44,
                borderRadius: radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cc.raised,
              }}
            >
              <Text style={{ color: cc.text, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={applySharedTheme}
              style={{
                flex: 2,
                height: 44,
                borderRadius: radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cc.accent,
              }}
            >
              <Text style={{ color: cc.onAccent, fontWeight: '600' }}>Apply for everyone</Text>
            </Pressable>
          </View>
        )}
        <Row
          icon="eye"
          label="Use my own theme instead"
          description="Personal override, only on your devices"
          right={
            <Switch
              value={conv.useLocalTheme}
              onValueChange={(v) =>
                void prefs({ use_local_theme: v, local_theme: conv.localTheme ?? conv.theme })
              }
              trackColor={{ true: cc.accent }}
              accessibilityLabel="Use my own theme"
            />
          }
        />
        {conv.useLocalTheme && (
          <>
            <ThemePicker
              value={localDraft ?? conv.localTheme ?? conv.theme}
              onPick={(t) => setLocalDraft(t)}
            />
            {localDraft && (
              <Pressable
                onPress={() =>
                  void prefs({ local_theme: localDraft }).then(() => setLocalDraft(null))
                }
                style={{
                  margin: 14,
                  marginTop: 0,
                  height: 44,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cc.raised,
                }}
              >
                <Text style={{ color: cc.text, fontWeight: '600' }}>Save my theme</Text>
              </Pressable>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard title="Privacy & security">
        <Row
          icon="clock"
          label="Disappearing messages"
          value={
            DISAPPEARING.find((o) => o.seconds === conv.disappearingSeconds)?.label ??
            `${conv.disappearingSeconds}s`
          }
          onPress={canEdit ? setTtl : undefined}
        />
        {peer && (
          <Row
            icon="shield"
            label="Verify safety number"
            onPress={() =>
              router.push({
                pathname: '/messages/verify/[userId]',
                params: { userId: peer.id, conversationId: id },
              })
            }
          />
        )}
        <Row
          icon="pin"
          label="Pin chat"
          right={
            <Switch
              value={conv.pinned}
              onValueChange={(v) => void prefs({ pinned: v })}
              trackColor={{ true: cc.accent }}
              accessibilityLabel="Pin chat"
            />
          }
        />
        <Row
          icon="archive"
          label="Archive chat"
          right={
            <Switch
              value={conv.archived}
              onValueChange={(v) => void prefs({ archived: v })}
              trackColor={{ true: cc.accent }}
              accessibilityLabel="Archive chat"
            />
          }
        />
      </SectionCard>

      <SectionCard title={`Shared media · ${images.length} photos · ${files} files`}>
        {images.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, padding: 12 }}
          >
            {images
              .slice(-12)
              .reverse()
              .map((m) => (
                <View key={m.id} style={{ transform: [{ scale: 0.5 }], margin: -58 }}>
                  <ImageAttachment attachment={m.attachment} />
                </View>
              ))}
          </ScrollView>
        ) : (
          <Text style={{ color: cc.textSubtle, padding: 16 }}>
            Photos and files you share appear here.
          </Text>
        )}
        {links.map((l, i) => (
          <Row
            key={`${l.href}-${i}`}
            icon="link"
            label={l.value.replace(/^https?:\/\//, '').slice(0, 40)}
            onPress={() => void Linking.openURL(l.href)}
          />
        ))}
      </SectionCard>

      {conv.kind === 'group' && (
        <SectionCard
          title={`${conv.members.length} members`}
          footer={
            isAdmin
              ? undefined
              : conv.settingsPolicy === 'admins'
                ? 'Only admins can edit group settings.'
                : undefined
          }
        >
          {canEdit && <Row icon="user-plus" label="Add members" onPress={() => setAdding(true)} />}
          {conv.members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => memberActions(m)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: pressed ? cc.raised : 'transparent',
              })}
            >
              <Avatar
                path={m.avatar_path}
                name={m.username}
                userId={m.id}
                displayName={m.display_name}
                size={38}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cc.text, fontWeight: '600' }}>
                  {m.id === userId
                    ? 'You'
                    : (nicknames.data?.[m.id] ?? m.display_name ?? m.username)}
                </Text>
                <Text style={{ color: cc.textSubtle, fontSize: 12 }}>@{m.username}</Text>
              </View>
              {m.role === 'admin' && (
                <Text style={{ color: cc.accent, fontSize: 12, fontWeight: '600' }}>Admin</Text>
              )}
            </Pressable>
          ))}
          {isAdmin && (
            <Row
              icon="sliders"
              label="Only admins can edit"
              right={
                <Switch
                  value={conv.settingsPolicy === 'admins'}
                  onValueChange={(v) =>
                    void groupAdmin
                      .setPolicy(supabase, id, v ? 'admins' : 'everyone')
                      .then(refresh, fail)
                  }
                  trackColor={{ true: cc.accent }}
                  accessibilityLabel="Only admins can edit"
                />
              }
            />
          )}
        </SectionCard>
      )}

      <SectionCard>
        <Row
          icon="trash"
          label="Clear chat on this device"
          danger
          onPress={() =>
            Alert.alert('Clear chat?', 'Removes the decrypted history from this device only.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: () => void engine?.clearConversation(id),
              },
            ])
          }
        />
        {conv.kind === 'direct' && peer && (
          <>
            <Row
              icon="flag"
              label={`Report ${peer.username}`}
              danger
              onPress={() =>
                Alert.alert(
                  'Report account',
                  'Our team reviews the account. Message content stays encrypted and is never shared with us.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Report',
                      style: 'destructive',
                      onPress: () =>
                        void reportContent(supabase, userId, {
                          target_type: 'profile',
                          target_id: peer.id,
                          reason: 'harassment',
                        }).then(() => Alert.alert('Reported', 'Thanks — we’ll take a look.'), fail),
                    },
                  ],
                )
              }
            />
            <Row
              icon="slash"
              label={`Block ${peer.username}`}
              danger
              onPress={() =>
                Alert.alert(
                  `Block ${peer.username}?`,
                  'They won’t be able to message you or see your profile.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Block',
                      style: 'destructive',
                      onPress: () =>
                        void block(supabase, userId, peer.id).then(() => router.back(), fail),
                    },
                  ],
                )
              }
            />
          </>
        )}
        {conv.kind === 'group' && (
          <Row
            icon="log-out"
            label="Leave group"
            danger
            onPress={() =>
              Alert.alert('Leave group?', 'You’ll stop receiving messages from this group.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Leave',
                  style: 'destructive',
                  onPress: () =>
                    void groupAdmin.removeMember(supabase, id, userId).then(() => {
                      refresh();
                      router.replace('/messages');
                    }, fail),
                },
              ])
            }
          />
        )}
        <Row
          icon="x-circle"
          label="Delete chat"
          danger
          description="Clears it here and hides it until a new message arrives"
          onPress={() =>
            Alert.alert(
              'Delete chat?',
              'Messages are removed from your devices. Others keep their copies.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    void (async () => {
                      await engine?.clearConversation(id);
                      await prefs({ archived: true, cleared_before_seq: conv.lastSeq });
                      router.replace('/messages');
                    })(),
                },
              ],
            )
          }
        />
      </SectionCard>

      <Modal
        visible={nickDraft !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNickDraft(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: cc.dark ? 'rgba(0,0,0,0.6)' : 'rgba(11,20,22,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: cc.raised,
              borderRadius: radii.lg,
              padding: 20,
              gap: 14,
              borderWidth: 1,
              borderColor: cc.line,
            }}
          >
            <Text style={{ color: cc.text, fontSize: 18, fontWeight: '600' }}>Nickname</Text>
            <Text style={{ color: cc.textMuted, fontSize: 13 }}>Only you will see this name.</Text>
            <TextInput
              value={nickDraft ?? ''}
              onChangeText={setNickDraft}
              autoFocus
              maxLength={40}
              placeholder={peer?.display_name || peer?.username}
              placeholderTextColor={cc.textSubtle}
              style={{
                height: 46,
                borderRadius: radii.md,
                backgroundColor: cc.panel,
                borderWidth: 1,
                borderColor: cc.line,
                color: cc.text,
                paddingHorizontal: 12,
              }}
              accessibilityLabel="Nickname"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setNickDraft(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cc.panel,
                }}
              >
                <Text style={{ color: cc.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  void setNickname(supabase, userId, peer!.id, nickDraft).then(() => {
                    setNickDraft(null);
                    void qc.invalidateQueries({ queryKey: qk.connect.nicknames });
                  }, fail)
                }
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cc.accent,
                }}
              >
                <Text style={{ color: cc.onAccent, fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={adding}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAdding(false)}
      >
        <View style={{ flex: 1, backgroundColor: cc.night, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: cc.text, fontSize: 18, fontWeight: '600', flex: 1 }}>
              Add members
            </Text>
            <Pressable onPress={() => setAdding(false)} accessibilityLabel="Close">
              <Icon name="x" size={22} color={cc.text} />
            </Pressable>
          </View>
          <TextInput
            value={term}
            onChangeText={setTerm}
            autoFocus
            autoCapitalize="none"
            placeholder="Search people"
            placeholderTextColor={cc.textSubtle}
            style={{
              height: 46,
              borderRadius: radii.md,
              backgroundColor: cc.panel,
              borderWidth: 1,
              borderColor: cc.line,
              color: cc.text,
              paddingHorizontal: 12,
            }}
          />
          {(search.data ?? [])
            .filter((u) => !conv.members.some((m) => m.id === u.id))
            .map((u) => (
              <Pressable
                key={u.id}
                onPress={() =>
                  void groupAdmin.addMembers(supabase, id, [u.id]).then(() => {
                    refresh();
                    void engine?.sync(id); // add their devices to the encrypted group now
                    setAdding(false);
                    setTerm('');
                  }, fail)
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
              >
                <Avatar
                  path={u.avatar_path}
                  name={u.username}
                  userId={u.id}
                  displayName={u.display_name}
                  size={40}
                />
                <Text style={{ color: cc.text, flex: 1 }}>{u.username}</Text>
                <Icon name="plus" size={18} color={cc.accent} />
              </Pressable>
            ))}
          <Text style={{ color: cc.textSubtle, fontSize: 12 }}>
            New members can only read messages sent after they join.
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function DetailsScreen() {
  return (
    <ConnectGate>
      <Details />
    </ConnectGate>
  );
}
