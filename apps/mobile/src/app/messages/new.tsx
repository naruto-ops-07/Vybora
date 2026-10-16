import { Icon } from '@/components/Icon';
import { createSecureConversation, fetchFriends, qk, searchProfiles } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { UserSummary } from '@vybora/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/Text';
import { radii } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { useCc, PrimaryButton } from '@/features/connect/ui/primitives';
import { supabase } from '@/lib/supabase';

export default function NewChat() {
  const cc = useCc();
  const qc = useQueryClient();
  const [term, setTerm] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const q = useDeferredValue(term.trim());
  const results = useQuery({
    queryKey: qk.search(q),
    queryFn: () => searchProfiles(supabase, q),
    enabled: q.length > 0,
  });
  // Friends first: a one-tap quick-pick while the search box is empty.
  const friends = useQuery({ queryKey: qk.connect.friends, queryFn: () => fetchFriends(supabase) });
  const friendOptions = useMemo<UserSummary[]>(
    () =>
      (friends.data ?? []).map((f) => ({
        id: f.userId,
        username: f.username,
        display_name: f.displayName ?? '',
        avatar_path: f.avatarPath,
      })),
    [friends.data],
  );
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
                accessibilityLabel={`Remove ${u.username}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 4,
                  paddingRight: 10,
                  paddingVertical: 4,
                  borderRadius: radii.md,
                  backgroundColor: cc.accentSoft,
                  borderWidth: 1,
                  borderColor: cc.accent,
                }}
              >
                <Avatar path={u.avatar_path} name={u.username} size={22} />
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
              backgroundColor: cc.panel,
              borderWidth: 1,
              borderColor: cc.line,
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
            backgroundColor: cc.panel,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: cc.line,
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
        data={showFriends ? friendOptions : (results.data ?? [])}
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
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: pressed ? cc.panel : 'transparent',
              })}
            >
              <Avatar path={item.avatar_path} name={item.username} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cc.text, fontWeight: '600' }}>{item.username}</Text>
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
                {on && <Icon name="check" size={14} color="#fff" />}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: cc.textSubtle, textAlign: 'center', padding: 30 }}>
            {q
              ? 'No people found.'
              : 'Search for someone to message. Pick two or more to create a group.'}
          </Text>
        }
      />
      {picked.length > 0 && (
        <View style={{ padding: 16 }}>
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
