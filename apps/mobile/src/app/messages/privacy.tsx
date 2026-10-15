import type { IconName } from '@/components/Icon';
import {
  fetchBlocked,
  fetchConnectPrivacy,
  fetchMyContactMethod,
  qk,
  saveMyContactMethod,
  unblock,
  updateConnectPrivacy,
  type ConnectPrivacy,
} from '@vybora/api';
import { friendlyError, formatRelativeTime } from '@vybora/core';
import { CIPHERSUITE } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { Text, TextInput } from '@/components/Text';
import { useMe } from '@/features/auth/AuthProvider';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import { useCc, Pill, Row, SectionCard } from '@/features/connect/ui/primitives';
import { appLockSupport, isAppLockEnabled, setAppLock } from '@/lib/connect/appLock';
import { supabase } from '@/lib/supabase';

function Privacy() {
  const cc = useCc();
  const { userId } = useMe();
  const { engine, backend, signOutAndWipe } = useConnect();
  const qc = useQueryClient();
  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId),
  });
  const devices = useQuery({
    queryKey: qk.connect.devices,
    enabled: !!engine,
    queryFn: () => engine!.listMyDevices(),
  });
  const blocked = useQuery({ queryKey: qk.blocked, queryFn: () => fetchBlocked(supabase) });
  const contact = useQuery({
    queryKey: qk.connect.myPhone,
    queryFn: () => fetchMyContactMethod(supabase, userId),
  });
  const [phone, setPhone] = useState('');
  const [lock, setLock] = useState(false);
  useEffect(() => void isAppLockEnabled().then(setLock), []);
  useEffect(() => setPhone(contact.data?.phone_e164 ?? ''), [contact.data?.phone_e164]);

  const set = (patch: Partial<ConnectPrivacy>) =>
    void updateConnectPrivacy(supabase, userId, patch).then(
      () => qc.invalidateQueries({ queryKey: qk.connect.privacy }),
      (e) => Alert.alert('Not saved', friendlyError(e)),
    );
  const p = privacy.data;
  const toggle = (
    key: keyof ConnectPrivacy,
    label: string,
    description: string,
    icon: IconName,
  ) => (
    <Row
      icon={icon}
      label={label}
      description={description}
      right={
        <Switch
          value={!!p?.[key]}
          onValueChange={(v) => set({ [key]: v })}
          trackColor={{ true: cc.accent }}
          accessibilityLabel={label}
        />
      }
    />
  );
  const visibility = contact.data?.visibility ?? 'nobody';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cc.night }}
      contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 60 }}
    >
      <Stack.Screen
        options={{
          title: 'Privacy & security',
          headerStyle: { backgroundColor: cc.night },
          headerTintColor: cc.text,
        }}
      />

      <SectionCard
        title="Encryption"
        footer="Your messages are encrypted on this device and can only be decrypted on the devices of the people you talk to. The protocol library has not yet had an independent security audit."
      >
        <Row icon="lock" label="End-to-end encryption" value="On" />
        <Row
          icon="cpu"
          label="Protocol"
          value="MLS (RFC 9420)"
          description={CIPHERSUITE.replace(/_/g, ' ')}
        />
        <Row
          icon="hard-drive"
          label="Crypto engine"
          value={backend === 'native' ? 'Native' : 'Audited JS (noble)'}
        />
      </SectionCard>

      <SectionCard
        title="Linked devices"
        footer="Remove a device you no longer use. It loses access to new messages immediately and wipes its keys next time it opens."
      >
        {(devices.data ?? [])
          .filter((d) => !d.revoked)
          .map((d) => {
            const current = d.id === engine?.deviceId;
            return (
              <Row
                key={d.id}
                icon={d.platform === 'web' ? 'monitor' : 'smartphone'}
                label={`${d.label || d.platform}${current ? ' (this device)' : ''}`}
                description={`Added ${new Date(d.createdAt).toLocaleDateString()} · active ${formatRelativeTime(d.lastSeenAt)}`}
                danger={!current}
                onPress={
                  current
                    ? undefined
                    : () =>
                        Alert.alert(
                          'Remove device?',
                          `${d.label || d.platform} will no longer receive your messages.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () =>
                                void engine!.revokeDevice(d.id).then(
                                  () => qc.invalidateQueries({ queryKey: qk.connect.devices }),
                                  (e) => Alert.alert('Not removed', friendlyError(e)),
                                ),
                            },
                          ],
                        )
                }
              />
            );
          })}
      </SectionCard>

      <SectionCard title="Messaging privacy">
        {toggle(
          'read_receipts',
          'Read receipts',
          'If off, others won’t see when you’ve read their messages (and you won’t see theirs).',
          'check-circle',
        )}
        {toggle(
          'typing_indicators',
          'Typing indicators',
          'Show when you’re typing.',
          'more-horizontal',
        )}
        {toggle(
          'show_online',
          'Show when I’m online',
          'Only to people you share a chat with.',
          'circle',
        )}
        {/* Follow-based limits came from the old social features; only offer the way back. */}
        {p?.message_privacy === 'following' && (
          <Row
            icon="users"
            label="Who can start chats with me"
            description="Limited to people you followed before VYBORA became messaging-only. Tap to allow everyone."
            onPress={() => set({ message_privacy: 'everyone' })}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Notifications"
        footer="Turning notifications off never blocks or deletes messages. Notifications never include message content."
      >
        {toggle(
          'notifications_enabled',
          'Message notifications',
          'Applies to all chats on all your devices.',
          'bell',
        )}
        {toggle(
          'message_previews',
          'Show sender in notifications',
          'If off, notifications only say “New message”.',
          'user',
        )}
      </SectionCard>

      <SectionCard title="App lock">
        <Row
          icon="lock"
          label="Lock Messages"
          description="Require Face ID, fingerprint or passcode to open Messages."
          right={
            <Switch
              value={lock}
              onValueChange={async (v) => {
                if (v) {
                  const support = await appLockSupport();
                  if (!support.available) return Alert.alert('Not available', support.reason);
                }
                if (await setAppLock(v)) setLock(v);
              }}
              trackColor={{ true: cc.accent }}
              accessibilityLabel="Lock Messages"
            />
          }
        />
      </SectionCard>

      <SectionCard
        title="Phone number"
        footer="Optional. Never public by default and never used to find you. We don’t upload your address book."
      >
        <View style={{ padding: 14, gap: 12 }}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+1 415 555 0123"
            placeholderTextColor={cc.textSubtle}
            accessibilityLabel="Phone number in international format"
            style={{
              height: 46,
              borderRadius: 12,
              backgroundColor: cc.raised,
              borderWidth: 1,
              borderColor: cc.line,
              color: cc.text,
              paddingHorizontal: 12,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['nobody', 'contacts', 'everyone'] as const).map((v) => (
              <Pill
                key={v}
                label={
                  { nobody: 'Nobody', contacts: 'Chats & mutual follows', everyone: 'Everyone' }[v]
                }
                active={visibility === v}
                onPress={() => {
                  const normalized = phone.replace(/[^\d+]/g, '');
                  if (normalized && !/^\+[1-9]\d{6,14}$/.test(normalized))
                    return Alert.alert(
                      'Check the number',
                      'Use international format, e.g. +14155550123.',
                    );
                  void saveMyContactMethod(supabase, userId, normalized || null, v).then(
                    () => qc.invalidateQueries({ queryKey: qk.connect.myPhone }),
                    (e) => Alert.alert('Not saved', friendlyError(e)),
                  );
                }}
              />
            ))}
          </View>
        </View>
      </SectionCard>

      <SectionCard title={`Blocked (${blocked.data?.length ?? 0})`}>
        {(blocked.data ?? []).map((u) => (
          <Row
            key={u.id}
            icon="slash"
            label={u.username}
            onPress={() =>
              Alert.alert(`Unblock ${u.username}?`, undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Unblock',
                  onPress: () =>
                    void unblock(supabase, userId, u.id).then(() =>
                      qc.invalidateQueries({ queryKey: qk.blocked }),
                    ),
                },
              ])
            }
          />
        ))}
        {!blocked.data?.length && (
          <Text style={{ color: cc.textSubtle, padding: 16 }}>You haven’t blocked anyone.</Text>
        )}
      </SectionCard>

      <SectionCard>
        <Row
          icon="log-out"
          label="Sign out and erase this device"
          danger
          description="Removes this device and deletes its keys and message history."
          onPress={() =>
            Alert.alert(
              'Erase this device?',
              'Your decrypted messages on this device will be deleted. Other devices keep theirs.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Erase and sign out',
                  style: 'destructive',
                  onPress: () => void signOutAndWipe().then(() => router.replace('/login')),
                },
              ],
            )
          }
        />
      </SectionCard>
    </ScrollView>
  );
}

export default function PrivacyScreen() {
  return (
    <ConnectGate>
      <Privacy />
    </ConnectGate>
  );
}
