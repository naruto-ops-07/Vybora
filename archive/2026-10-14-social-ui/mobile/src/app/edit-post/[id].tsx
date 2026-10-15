import { fetchPost, qk, updatePost, updatePostEverywhere } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { LIMITS } from '@vybora/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { Button, Empty, ErrorView, Loading, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/** Edit caption + comment settings. Only the author can save (enforced by RLS). */
export default function EditPost() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const post = useQuery({ queryKey: qk.post(id), queryFn: () => fetchPost(supabase, id) });
  const [caption, setCaption] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);

  useEffect(() => {
    if (post.data) {
      setCaption(post.data.caption);
      setCommentsEnabled(post.data.comments_enabled);
    }
  }, [post.data]);

  const save = useMutation({
    mutationFn: () => updatePost(supabase, id, { caption, comments_enabled: commentsEnabled }),
    onSuccess: () => {
      updatePostEverywhere(qc, id, (p) => ({ ...p, caption, comments_enabled: commentsEnabled }));
      router.back();
    },
    onError: (e) => Alert.alert('Not saved', friendlyError(e)),
  });

  if (post.isPending) return <Loading />;
  if (post.isError) return <ErrorView error={post.error} onRetry={() => void post.refetch()} />;
  if (!post.data) return <Empty icon="eye-off" title="Post unavailable" />;

  const dirty = caption !== post.data.caption || commentsEnabled !== post.data.comments_enabled;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label={`Caption (${caption.length}/${LIMITS.caption})`}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={LIMITS.caption}
          autoFocus
          style={{ minHeight: 140, textAlignVertical: 'top' }}
        />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="label">Allow comments</Text>
            <Text variant="muted">Existing comments stay visible either way.</Text>
          </View>
          <Switch
            value={commentsEnabled}
            onValueChange={setCommentsEnabled}
            trackColor={{ true: t.accent }}
            accessibilityLabel="Allow comments"
          />
        </View>
        <Button
          title="Save"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
