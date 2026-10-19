import { Icon } from '@/components/Icon';
import {
  createSecureConversation,
  directChatActivity,
  fetchFriends,
  qk,
  searchProfiles,
} from '@vybora/api';
import {
  friendlyError,
  orderQuickPick,
  QUICK_PICK_LIMIT,
  usernameFromAddParam,
} from '@vybora/core';
import type { UserSummary } from '@vybora/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/components/Text';
import { tint, useTheme } from '@/lib/theme';
import { Avatar, Button } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { useSecureInbox } from '@/features/connect/hooks';
import { addFriend, NoResultsEmpty } from '@/features/onboarding/EmptyStates';
import { useCc, PrimaryButton } from '@/features/connect/ui/primitives';
import { supabase } from '@/lib/supabase';

export default function NewChat() {
  const { radii } = useTheme();
  const cc = useCc();
  const qc = useQueryClient();
  const [term, setTerm] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [showAll, setShowAll] = useState(false);
  const { userId } = useMe();
  const inbox = useSecureInbox();
  const q = useDeferredValue(term.trim());
  const results = useQuery({
    queryKey: qk.search(q),
    queryFn: () => searchProfiles(supabase, q),
    enabled: q.length > 0,
  });
  // Friends first: a one-tap quick-pick while the search box is empty, most
  // recent chats first, the first eight until "Show all friends".
  const friends = useQuery({ queryKey: qk.connect.friends, queryFn: () => fetchFriends(supabase) });
  const friendOptions = useMemo<UserSummary[]>(
    () =>
      orderQuickPick(friends.data ?? [], directChatActivity(inbox.data, userId)).map((f) => ({
        id: f.userId,
        username: f.username,
        display_name: f.displayName ?? '',
        avatar_path: f.avatarPath,
      })),
    [friends.data, inbox.data, userId],
  );
  const shownFriends = showAll ? friendOptions : friendOptions.slice(0, QUICK_PICK_LIMIT);
  const showFriends = !q && friendOptions.length > 0;
  const isGroup = picked.length > 1;

  const create = useMutation({
    mutationFn: () =>
      createSecureConversation(
        supabase,
        isGroup ? 'group' : 'direct',
        picked.map((p) => p.id),
        isGroup ? title.trim() || undefined : undefined,
      ),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      router.replace({ pathname: '/messages/[id]', params: { id } });
    },
    onError: (e) =>
      Alert.alert(
        'Couldn’t start chat',
        (e as { message?: string }).message?.includes('cannot_message')
          ? 'One of these people doesn’t accept messages from you.'
          : friendlyError(e),
      ),
  });

  const toggle = (u: UserSummary) =>
    setPicked((p) =>
      p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u].slice(0, 50),
    );

  return (
    <View style={{ flex: 1, backgroundColor: cc.night }}>
      <Stack.Screen
        options={{
          title: isGroup ? 'New group' : 'New chat',
          headerStyle: { backgroundColor: cc.night },
          headerTintColor: cc.text,
        }}
      />
      <View style={{ padding: 14, gap: 12 }}>
        {picked.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {picked.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => toggle(u)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${u.username}`}
                hitSlop={6}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 34,
                  paddingLeft: 4,
                  paddingRight: 12,
                  borderRadius: 999,
                  backgroundColor: cc.accentSoft,
                  borderWidth: 1,
                  borderColor: cc.accent,
                }}
              >
                <Avatar
                  path={u.avatar_path}
                  name={u.username}
                  userId={u.id}
                  displayName={u.display_name}
                  size={26}
                  decorative
                />
                <Text style={{ color: cc.text, fontWeight: '600' }}>{u.username}</Text>
                <Icon name="x" size={13} color={cc.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
        {isGroup && (
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            placeholder="Group name (optional)"
            placeholderTextColor={cc.textSubtle}
            accessibilityLabel="Group name"
            style={{
              height: 46,
              borderRadius: radii.md,
              backgroundColor: cc.raised,
              borderWidth: 1,
              borderColor: cc.lineStrong,
              color: cc.text,
              paddingHorizontal: 14,
            }}
          />
        )}
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
            value={term}
            onChangeText={setTerm}
            autoFocus
            autoCapitalize="none"
            placeholder="Search people"
            placeholderTextColor={cc.textSubtle}
            accessibilityLabel="Search people"
            style={{ flex: 1, height: 44, color: cc.text }}
          />
        </View>
      </View>
      <FlatList
        data={showFriends ? shownFriends : (results.data ?? [])}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          showFriends ? (
            <Text
              accessibilityRole="header"
              style={{
                color: cc.textMuted,
                fontSize: 13,
                fontWeight: '600',
                paddingHorizontal: 16,
                paddingBottom: 4,
              }}
            >
              Friends
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const on = picked.some((p) => p.id === item.id);
          return (
            <Pressable
              onPress={() => toggle(item)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginHorizontal: 8,
                paddingHorizontal: 8,
                paddingVertical: 8,
                minHeight: 60,
                borderRadius: radii.md,
                backgroundColor: on ? cc.accentSoft : pressed ? tint(cc.text, '12') : 'transparent',
              })}
            >
              <Avatar
                path={item.avatar_path}
                name={item.username}
                userId={item.id}
                displayName={item.display_name}
                size={44}
              />
              <View style={{ flex: 1 }}>
                <Text scale style={{ color: cc.text, fontSize: 16, fontWeight: '600' }}>
                  {item.username}
                </Text>
                {!!item.display_name && (
                  <Text style={{ color: cc.textMuted, fontSize: 13 }}>{item.display_name}</Text>
                )}
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: on ? cc.accent : cc.lineStrong,
                  backgroundColor: on ? cc.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on && <Icon name="check" size={14} color={cc.onAccent} />}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          showFriends && !showAll && friendOptions.length > QUICK_PICK_LIMIT ? (
            <View style={{ paddingHorizontal: 8, paddingTop: 4 }}>
              <Button
                title={`Show all friends (${friendOptions.length})`}
                variant="ghost"
                onPress={() => setShowAll(true)}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          q && results.isSuccess ? (
            <NoResultsEmpty
              action={
                <Button
                  title="Add a friend"
                  icon="user-plus"
                  variant="outline"
                  onPress={() => addFriend(usernameFromAddParam(q))}
                />
              }
            />
          ) : q ? null : (
            <Text style={{ color: cc.textSubtle, textAlign: 'center', padding: 30 }}>
              Search for someone to message. Pick two or more to create a group.
            </Text>
          )
        }
      />
      {picked.length > 0 && (
        <View
          style={{
            padding: 16,
            backgroundColor: cc.bar,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: cc.highContrast ? cc.lineStrong : cc.line,
          }}
        >
          <PrimaryButton
            title={
              isGroup ? `Create group (${picked.length + 1})` : `Message ${picked[0]!.username}`
            }
            icon="lock"
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </View>
      )}
    </View>
  );
}
