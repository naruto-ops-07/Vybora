import {
  createPost,
  newMediaPath,
  qk,
  removeObjects,
  UploadCancelledError,
  uploadObject,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { LIMITS } from '@vybora/validation';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Empty, Icon, Text, TextField } from '@/components/ui';
import { useMe } from '@/features/auth/AuthProvider';
import { pickMedia, type PickedMedia } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { radii, useTheme } from '@/lib/theme';

export default function Create() {
  const t = useTheme();
  const { userId } = useMe();
  const qc = useQueryClient();
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [asReel, setAsReel] = useState(false);
  const [altText, setAltText] = useState<Record<string, string>>({}); // uri → description
  const [phase, setPhase] = useState<'editing' | 'uploading' | 'saving' | 'failed'>('editing');
  const [progress, setProgress] = useState(0);
  const uploaded = useRef(new Map<string, string>()); // uri → storage path
  const abort = useRef<AbortController | null>(null);

  const canReel = items.length === 1 && items[0]?.mediaType === 'video';
  const kind = canReel && asReel ? 'reel' : 'post';
  const busy = phase === 'uploading' || phase === 'saving';

  // Remove uploaded-but-unpublished objects if the user leaves.
  useEffect(
    () => () => {
      abort.current?.abort();
      const paths = [...uploaded.current.values()];
      if (paths.length) void removeObjects(supabase, 'media', paths).catch(() => undefined);
    },
    [],
  );

  const pick = async () => {
    try {
      const picked = await pickMedia('post', {
        multiple: true,
        limit: LIMITS.mediaPerPost - items.length,
      });
      setItems((prev) => [...prev, ...picked].slice(0, LIMITS.mediaPerPost));
    } catch (e) {
      Alert.alert('Can’t add media', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const reset = () => {
    setItems([]);
    setCaption('');
    setAltText({});
    setAsReel(false);
    setPhase('editing');
    setProgress(0);
  };

  const publish = async () => {
    setPhase('uploading');
    const controller = new AbortController();
    abort.current = controller;
    try {
      for (const [i, m] of items.entries()) {
        if (uploaded.current.has(m.uri)) continue;
        const path = newMediaPath(userId, m.mime);
        await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
          bucket: 'media',
          path,
          body: m.body,
          contentType: m.mime,
          signal: controller.signal,
          onProgress: (f) => setProgress((i + f) / items.length),
        });
        uploaded.current.set(m.uri, path);
      }
      setPhase('saving');
      const id = await createPost(supabase, {
        caption,
        kind,
        commentsEnabled,
        media: items.map((m) => ({
          storage_path: uploaded.current.get(m.uri)!,
          media_type: m.mediaType,
          mime_type: m.mime,
          width: m.width,
          height: m.height,
          duration_ms: m.durationMs,
          alt_text: altText[m.uri]?.trim() || null,
        })),
      });
      uploaded.current.clear();
      void qc.invalidateQueries({ queryKey: qk.feed.all });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      reset();
      router.push({ pathname: '/p/[id]', params: { id } });
    } catch (e) {
      if (e instanceof UploadCancelledError) return setPhase('editing');
      setPhase('failed');
      Alert.alert('Not published', friendlyError(e, 'Your media is kept — tap Retry.'));
    } finally {
      abort.current = null;
    }
  };

  if (!items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <Empty
          icon="image"
          title="Share photos and videos"
          body="Choose up to 10 items from your library."
          action={<Button title="Select from library" icon="plus" onPress={pick} />}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text variant="title">New {kind}</Text>
            {!busy && (
              <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Discard">
                <Text style={{ color: t.danger, fontWeight: '600' }}>Discard</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {items.map((m, i) => (
              <View
                key={m.uri}
                style={{
                  width: 110,
                  height: 138,
                  borderRadius: radii.md,
                  overflow: 'hidden',
                  backgroundColor: t.surfaceMuted,
                }}
              >
                {m.mediaType === 'image' ? (
                  <Image
                    source={{ uri: m.uri }}
                    style={{ flex: 1 }}
                    contentFit="cover"
                    accessibilityLabel={`Selected image ${i + 1}`}
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="film" />
                  </View>
                )}
                {!busy && (
                  <Pressable
                    onPress={() => setItems((prev) => prev.filter((x) => x.uri !== m.uri))}
                    accessibilityLabel={`Remove item ${i + 1}`}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      borderRadius: 12,
                      padding: 4,
                    }}
                  >
                    <Icon name="x" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            ))}
            {items.length < LIMITS.mediaPerPost && !busy && (
              <Pressable
                onPress={pick}
                accessibilityLabel="Add more"
                style={{
                  width: 110,
                  height: 138,
                  borderRadius: radii.md,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: t.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="plus" />
              </Pressable>
            )}
          </ScrollView>

          {items.map((m, i) => (
            <TextField
              key={m.uri}
              label={`Alt text for ${m.mediaType === 'video' ? 'video' : 'photo'} ${i + 1} (optional)`}
              hint={i === 0 ? 'Describe it for people who use screen readers.' : undefined}
              value={altText[m.uri] ?? ''}
              onChangeText={(v) => setAltText((a) => ({ ...a, [m.uri]: v }))}
              maxLength={LIMITS.altText}
              editable={!busy}
            />
          ))}

          <TextField
            label={`Caption (${caption.length}/${LIMITS.caption})`}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={LIMITS.caption}
            editable={!busy}
            placeholder="Write a caption… #hashtags @mentions"
            style={{ minHeight: 110, textAlignVertical: 'top' }}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text>Allow comments</Text>
            <Switch
              value={commentsEnabled}
              onValueChange={setCommentsEnabled}
              disabled={busy}
              trackColor={{ true: t.accent }}
              accessibilityLabel="Allow comments"
            />
          </View>
          {canReel && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text>Share as a reel</Text>
              <Switch
                value={asReel}
                onValueChange={setAsReel}
                disabled={busy}
                trackColor={{ true: t.accent }}
                accessibilityLabel="Share as a reel"
              />
            </View>
          )}

          {busy ? (
            <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
              <Text variant="label">
                {phase === 'saving' ? 'Publishing…' : 'Uploading…'} {Math.round(progress * 100)}%
              </Text>
              <View
                style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceMuted }}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
              >
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${progress * 100}%`,
                    backgroundColor: t.accent,
                  }}
                />
              </View>
              {phase === 'uploading' && (
                <Button
                  title="Cancel upload"
                  variant="secondary"
                  onPress={() => abort.current?.abort()}
                />
              )}
            </View>
          ) : (
            <Button
              title={phase === 'failed' ? 'Retry' : kind === 'reel' ? 'Share reel' : 'Share post'}
              icon={phase === 'failed' ? 'rotate-cw' : undefined}
              onPress={publish}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
