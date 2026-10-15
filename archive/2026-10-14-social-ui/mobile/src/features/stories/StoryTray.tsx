import {
  createStory,
  fetchStoryTray,
  newMediaPath,
  qk,
  removeObjects,
  uploadObject,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Avatar, Icon, Text } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { pickMedia } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export function StoryTray() {
  const t = useTheme();
  const { userId, profile } = useMe();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const tray = useQuery({ queryKey: qk.stories.tray, queryFn: () => fetchStoryTray(supabase) });
  const mine = tray.data?.find((s) => s.is_me);

  const addStory = async () => {
    let uploaded: string | null = null;
    try {
      const [m] = await pickMedia('story');
      if (!m) return;
      const path = newMediaPath(userId, m.mime);
      setProgress(0);
      await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
        bucket: 'media',
        path,
        body: m.body,
        contentType: m.mime,
        onProgress: setProgress,
      });
      uploaded = path;
      await createStory(supabase, userId, {
        storage_path: path,
        media_type: m.mediaType,
        mime_type: m.mime,
        width: m.width ?? undefined,
        height: m.height ?? undefined,
        duration_ms: m.durationMs ?? undefined,
      });
      uploaded = null;
      void qc.invalidateQueries({ queryKey: qk.stories.tray });
    } catch (e) {
      Alert.alert(
        'Story not shared',
        e instanceof Error && !('code' in e) ? e.message : friendlyError(e),
      );
      if (uploaded) void removeObjects(supabase, 'media', [uploaded]).catch(() => undefined);
    } finally {
      setProgress(null);
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 14 }}
      style={{ backgroundColor: t.surface }}
    >
      <View style={{ alignItems: 'center', width: 72, gap: 4 }}>
        <Pressable
          onPress={() =>
            mine
              ? router.push({ pathname: '/stories/[authorId]', params: { authorId: userId } })
              : addStory()
          }
          accessibilityLabel={mine ? 'View your story' : 'Add to your story'}
        >
          <Avatar
            path={profile?.avatar_path}
            name={profile?.username ?? 'you'}
            size={60}
            ring={mine ? 'seen' : undefined}
          />
        </Pressable>
        <Pressable
          onPress={addStory}
          disabled={progress !== null}
          accessibilityLabel="Add to your story"
          style={{
            position: 'absolute',
            right: 2,
            top: 44,
            backgroundColor: t.accent,
            borderRadius: 12,
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: t.surface,
          }}
        >
          {progress !== null ? (
            <ActivityIndicator size="small" color={t.onAccent} />
          ) : (
            <Icon name="plus" size={14} color={t.onAccent} />
          )}
        </Pressable>
        <Text variant="small" numberOfLines={1}>
          {progress !== null ? `${Math.round(progress * 100)}%` : 'Your story'}
        </Text>
      </View>
      {tray.data
        ?.filter((s) => !s.is_me)
        .map((s) => (
          <Pressable
            key={s.author_id}
            onPress={() =>
              router.push({ pathname: '/stories/[authorId]', params: { authorId: s.author_id } })
            }
            style={{ alignItems: 'center', width: 72, gap: 4 }}
            accessibilityLabel={`${s.username} story${s.has_unseen ? ', new' : ''}`}
          >
            <Avatar
              path={s.avatar_path}
              name={s.username}
              size={60}
              ring={s.has_unseen ? 'unseen' : 'seen'}
            />
            <Text variant="small" numberOfLines={1} style={{ color: t.text }}>
              {s.username}
            </Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}
