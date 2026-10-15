import type { Story, StoryTrayItem } from '@vybora/types';
import { unwrap, type VyboraClient } from './client';

export async function fetchStoryTray(client: VyboraClient): Promise<StoryTrayItem[]> {
  return unwrap(await client.rpc('story_tray')).map((r) => ({
    author_id: r.author_id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    story_count: r.story_count ?? 0,
    latest_at: r.latest_at!,
    has_unseen: !!r.has_unseen,
    is_me: !!r.is_me,
  }));
}

/** Active stories for an author. Expired rows are filtered by RLS (server clock). */
export async function fetchAuthorStories(client: VyboraClient, authorId: string): Promise<Story[]> {
  const rows = unwrap(
    await client
      .from('stories')
      .select(
        'id, author_id, storage_path, media_type, mime_type, duration_ms, created_at, expires_at',
      )
      .eq('author_id', authorId)
      .order('created_at', { ascending: true }),
  );
  return rows as Story[];
}

export async function createStory(
  client: VyboraClient,
  userId: string,
  input: {
    storage_path: string;
    media_type: 'image' | 'video';
    mime_type: string;
    width?: number;
    height?: number;
    duration_ms?: number;
  },
) {
  return unwrap(
    await client
      .from('stories')
      .insert({ author_id: userId, ...input })
      .select('id')
      .single(),
  );
}

export async function markStoryViewed(client: VyboraClient, userId: string, storyId: string) {
  const { error } = await client
    .from('story_views')
    .insert({ story_id: storyId, viewer_id: userId });
  // Duplicate view (already seen) is fine; RLS denial for own story is expected and ignored.
  if (error && error.code !== '23505' && error.code !== '42501') throw error;
}

export async function deleteStory(client: VyboraClient, id: string) {
  const rows = unwrap(await client.from('stories').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('forbidden');
}

export async function fetchStoryViewers(client: VyboraClient, storyId: string) {
  return unwrap(await client.rpc('story_viewers', { p_story: storyId })).map((r) => ({
    id: r.viewer_id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    viewed_at: r.viewed_at!,
  }));
}
