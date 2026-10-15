import {
  deleteStory,
  fetchAuthorStories,
  fetchStoryTray,
  fetchStoryViewers,
  markStoryViewed,
  qk,
} from '@vybora/api';
import { formatRelativeTime, friendlyError, IMAGE_STORY_MS, storyTimeLeft } from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SignedImage, SignedVideo } from '@/components/Media';
import { Avatar, Empty, IconButton, Loading, Text } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/** Author-only list of who viewed a story (RLS hides it from everyone else). */
function ViewersSheet({
  storyId,
  expiresAt,
  onClose,
}: {
  storyId: string;
  expiresAt: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const viewers = useQuery({
    queryKey: qk.stories.viewers(storyId),
    queryFn: () => fetchStoryViewers(supabase, storyId),
  });
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="heading" accessibilityRole="header">
              Viewers {viewers.data ? `(${viewers.data.length})` : ''}
            </Text>
            <Text variant="small">{storyTimeLeft(expiresAt)}</Text>
          </View>
          <IconButton name="x" label="Close viewers" onPress={onClose} />
        </View>
        <FlatList
          data={viewers.data ?? []}
          keyExtractor={(v) => v.id}
          renderItem={({ item: v }) => (
            <Pressable
              onPress={() => {
                onClose();
                router.push({ pathname: '/u/[username]', params: { username: v.username } });
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Avatar path={v.avatar_path} name={v.username} size={42} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{v.username}</Text>
                {!!v.display_name && <Text variant="muted">{v.display_name}</Text>}
              </View>
              <Text variant="small">{formatRelativeTime(v.viewed_at)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            viewers.isPending ? <Loading /> : <Empty icon="eye" title="No views yet" />
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function StoryViewer() {
  const { authorId = '' } = useLocalSearchParams<{ authorId: string }>();
  const { userId } = useMe();
  const qc = useQueryClient();
  const tray = useQuery({ queryKey: qk.stories.tray, queryFn: () => fetchStoryTray(supabase) });
  const stories = useQuery({
    queryKey: qk.stories.author(authorId),
    queryFn: () => fetchAuthorStories(supabase, authorId),
  });
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const holdPaused = paused || showViewers;
  const items = stories.data ?? [];
  const story = items[index];
  const author = tray.data?.find((a) => a.author_id === authorId);
  const isMine = authorId === userId;
  const started = useRef(Date.now());

  useEffect(() => {
    setIndex(0);
    setProgress(0);
  }, [authorId]);

  const nextAuthor = useCallback(() => {
    const list = tray.data ?? [];
    const next = list[list.findIndex((a) => a.author_id === authorId) + 1];
    if (next)
      router.replace({ pathname: '/stories/[authorId]', params: { authorId: next.author_id } });
    else router.back();
  }, [tray.data, authorId]);

  const next = useCallback(() => {
    setProgress(0);
    if (index + 1 < items.length) setIndex(index + 1);
    else nextAuthor();
  }, [index, items.length, nextAuthor]);

  const prev = () => {
    setProgress(0);
    if (index > 0) setIndex(index - 1);
  };

  useEffect(() => {
    if (story && !isMine)
      void markStoryViewed(supabase, userId, story.id).then(() =>
        qc.invalidateQueries({ queryKey: qk.stories.tray }),
      );
  }, [story, isMine, userId, qc]);

  // Image timer (pauses while holding). Expiry is enforced server-side.
  useEffect(() => {
    if (!story || story.media_type !== 'image' || holdPaused) return;
    started.current = Date.now() - progress * IMAGE_STORY_MS;
    const id = setInterval(() => {
      const p = (Date.now() - started.current) / IMAGE_STORY_MS;
      if (p >= 1) {
        clearInterval(id);
        next();
      } else setProgress(p);
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, holdPaused, next]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {stories.isPending ? (
        <Loading />
      ) : !story ? (
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff' }}>No active stories</Text>
        </SafeAreaView>
      ) : (
        <>
          {story.media_type === 'video' ? (
            <SignedVideo
              key={story.id}
              path={story.storage_path}
              active={!holdPaused}
              loop={false}
              muted={false}
              contentFit="contain"
              label="Story video"
              onEnd={next}
              onProgress={setProgress}
            />
          ) : (
            <SignedImage
              key={story.id}
              path={story.storage_path}
              alt={`Story by ${author?.username ?? 'user'}`}
              style={{ backgroundColor: '#000' }}
            />
          )}
          <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
            <Pressable
              style={{ flex: 1 }}
              onPress={prev}
              accessibilityLabel="Previous story"
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
            />
            <Pressable
              style={{ flex: 2 }}
              onPress={next}
              accessibilityLabel="Next story"
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
            />
          </View>
          <SafeAreaView
            edges={['top']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 10, gap: 10 }}
            pointerEvents="box-none"
          >
            <View style={{ flexDirection: 'row', gap: 3 }} accessibilityElementsHidden>
              {items.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flex: 1,
                    height: 2.5,
                    borderRadius: 2,
                    backgroundColor: 'rgba(255,255,255,0.35)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: 2.5,
                      backgroundColor: '#fff',
                      width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%`,
                    }}
                  />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar path={author?.avatar_path} name={author?.username ?? '?'} size={32} />
              <Text style={{ color: '#fff', fontWeight: '700' }}>{author?.username}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 }}>
                {formatRelativeTime(story.created_at)}
              </Text>
              {isMine && (
                <>
                  <IconButton
                    name="eye"
                    label="Viewers"
                    color="#fff"
                    onPress={() => setShowViewers(true)}
                  />
                  <IconButton
                    name="trash-2"
                    label="Delete story"
                    color="#fff"
                    onPress={() => {
                      setPaused(true);
                      Alert.alert('Delete this story?', undefined, [
                        { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteStory(supabase, story.id);
                              void qc.invalidateQueries({ queryKey: ['stories'] });
                              router.back();
                            } catch (e) {
                              setPaused(false);
                              Alert.alert('Couldn’t delete story', friendlyError(e));
                            }
                          },
                        },
                      ]);
                    }}
                  />
                </>
              )}
              <IconButton name="x" label="Close" color="#fff" onPress={() => router.back()} />
            </View>
          </SafeAreaView>
          {showViewers && (
            <ViewersSheet
              storyId={story.id}
              expiresAt={story.expires_at}
              onClose={() => setShowViewers(false)}
            />
          )}
        </>
      )}
    </View>
  );
}
