import {
  deleteAccount,
  fetchSettings,
  qk,
  setAvatarPath,
  signOut,
  updateMyProfile,
  updateSettings,
  uploadObject,
} from '@vybora/api';
import { friendlyError, friendRequestsLabel, storagePaths, uuid } from '@vybora/core';
import { profileUpdateSchema } from '@vybora/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { Avatar, Button, Loading, Text, TextField } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { Row, SectionCard } from '@/features/connect/ui/primitives';
import { HandleCard } from '@/features/friends/HandleCard';
import { useFriendRequests } from '@/features/friends/hooks';
import { pickMedia } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function Settings() {
  const t = useTheme();
  const { userId, profile } = useMe();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: qk.settings(userId),
    queryFn: () => fetchSettings(supabase, userId),
  });
  // Poll for the badge only while Settings is on screen.
  const requests = useFriendRequests(useIsFocused());
  const incoming = requests.data?.incoming.length ?? 0;
  const [form, setForm] = useState({ username: '', display_name: '', bio: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile)
      setForm({
        username: profile.username,
        display_name: profile.display_name,
        bio: profile.bio,
        website: profile.website ?? '',
      });
  }, [profile]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.me(userId) });
    void qc.invalidateQueries({ queryKey: qk.connect.inbox });
  };
  const onError = (e: unknown) => Alert.alert('Something went wrong', friendlyError(e));

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileUpdateSchema.safeParse(form);
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
        );
        throw new Error('validation');
      }
      setErrors({});
      await updateMyProfile(supabase, userId, form);
    },
    onSuccess: () => {
      refresh();
      Alert.alert('Saved', 'Your profile was updated.');
    },
    onError: (e) => (e as Error).message !== 'validation' && onError(e),
  });

  const avatar = useMutation({
    mutationFn: async () => {
      const [m] = await pickMedia('avatar');
      if (!m) return;
      const path = storagePaths.avatar(userId, uuid(), m.mime);
      await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
        bucket: 'avatars',
        path,
        body: m.body,
        contentType: m.mime,
      });
      await setAvatarPath(supabase, userId, path);
    },
    onSuccess: refresh,
    onError: (e) =>
      Alert.alert(
        'Photo not updated',
        e instanceof Error && !('code' in e) ? e.message : friendlyError(e),
      ),
  });

  const push = useMutation({
    mutationFn: (v: boolean) => updateSettings(supabase, userId, { push_enabled: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.settings(userId) }),
    onError,
  });

  if (!profile || settings.isPending) return <Loading />;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const confirmDelete = () => {
    const message =
      'This permanently deletes your account, devices and everything you uploaded, including messages you sent. Other people keep their own decrypted copies.';
    if (Platform.OS === 'ios') {
      // Typed confirmation (the server re-checks the username).
      Alert.prompt(
        'Delete account permanently?',
        `${message}\n\nType “${profile.username}” to confirm.`,
        (typed) => {
          void deleteAccount(supabase, typed.trim().toLowerCase()).catch(onError);
        },
      );
      return;
    }
    // Android has no text prompt: require two explicit confirmations instead.
    Alert.alert('Delete account permanently?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Delete @${profile.username}?`, 'Last chance — this is permanent.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete forever',
              style: 'destructive',
              onPress: () => void deleteAccount(supabase, profile.username).catch(onError),
            },
          ]),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionCard
          title="Profile"
          footer="Your name, username, photo and about text are visible to signed-in people who search for you. Profile photos are not end-to-end encrypted."
        >
          <View style={{ padding: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar
                path={profile.avatar_path}
                name={profile.username}
                userId={userId}
                displayName={profile.display_name}
                size={56}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>
                  {profile.display_name || profile.username}
                </Text>
                <Text variant="mono">@{profile.username}</Text>
              </View>
              <Button
                title={avatar.isPending ? 'Uploading…' : 'Change photo'}
                variant="outline"
                compact
                onPress={() => avatar.mutate()}
                disabled={avatar.isPending}
              />
            </View>
            <HandleCard variant="compact" />
            <TextField
              label="Username"
              value={form.username}
              onChangeText={set('username')}
              autoCapitalize="none"
              error={errors.username}
            />
            <TextField
              label="Display name"
              value={form.display_name}
              onChangeText={set('display_name')}
              error={errors.display_name}
            />
            <TextField
              label={`About (${form.bio.length}/300)`}
              value={form.bio}
              onChangeText={set('bio')}
              multiline
              maxLength={300}
              error={errors.bio}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
            <TextField
              label="Website"
              value={form.website}
              onChangeText={set('website')}
              autoCapitalize="none"
              keyboardType="url"
              error={errors.website}
            />
            <Button title="Save profile" onPress={() => save.mutate()} loading={save.isPending} />
          </View>
        </SectionCard>

        <SectionCard title="Friends">
          <Row
            icon="users"
            label="Friends"
            description="Add people by username, answer requests, start a chat"
            value={incoming > 0 ? friendRequestsLabel(incoming) : undefined}
            onPress={() => router.push('/messages/friends')}
          />
        </SectionCard>

        <SectionCard title="Privacy & security">
          <Row
            icon="shield"
            label="Privacy & security"
            description="Linked devices, receipts, typing, app lock, phone number, blocked"
            onPress={() => router.push('/messages/privacy')}
          />
        </SectionCard>

        <SectionCard title="Appearance">
          <Row
            icon="palette"
            label="Appearance"
            description="Look and light or dark mode"
            onPress={() => router.push('/messages/appearance')}
          />
        </SectionCard>

        <SectionCard title="Accessibility">
          <Row
            icon="eye"
            label="Accessibility"
            description="Motion, text size, contrast, gestures"
            onPress={() => router.push('/messages/accessibility')}
          />
        </SectionCard>

        <SectionCard
          title="Notifications"
          footer="Controls push delivery to your phones. Notifications never include message content. Per-chat options are in each chat’s info."
        >
          <Row
            icon="bell"
            label="Push notifications"
            right={
              <Switch
                value={settings.data?.push_enabled ?? true}
                onValueChange={(v) => push.mutate(v)}
                trackColor={{ true: t.accent, false: t.borderStrong }}
                accessibilityLabel="Push notifications"
              />
            }
          />
        </SectionCard>

        <SectionCard
          title="Session"
          footer="Signing out keeps this phone’s encrypted history for next time. To erase it, use Privacy & security → Sign out and erase this device."
        >
          <Row
            icon="log-out"
            label="Sign out"
            onPress={() =>
              void signOut(supabase).then(
                () => router.replace('/login'),
                (e: unknown) => onError(e),
              )
            }
          />
        </SectionCard>

        <SectionCard title="Danger zone">
          <Row icon="trash" label="Delete account" danger onPress={confirmDelete} />
        </SectionCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
