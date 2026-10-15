import type { ScoreCursor, TimeCursor } from '@vybora/core';
import type { Database, MediaItem, PostCard, PostKind } from '@vybora/types';
import { unwrap, type VyboraClient } from './client';

type PostCardRow = Database['public']['Views']['post_cards']['Row'];

export const PAGE = {
  home: 10,
  explore: 24,
  reels: 5,
  profile: 18,
  hashtag: 24,
  saved: 24,
} as const;

/** Normalize a post_cards row (view columns are nullable in generated types). */
export function toPostCard(row: PostCardRow): PostCard {
  return {
    id: row.id!,
    author_id: row.author_id!,
    kind: (row.kind ?? 'post') as PostKind,
    caption: row.caption ?? '',
    comments_enabled: row.comments_enabled ?? true,
    status: (row.status ?? 'published') as PostCard['status'],
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at!,
    updated_at: row.updated_at!,
    author: row.author as unknown as PostCard['author'],
    media: ((row.media as unknown as MediaItem[]) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position),
    liked_by_me: !!row.liked_by_me,
    saved_by_me: !!row.saved_by_me,
  };
}

const cursorArgs = (c?: TimeCursor | null) => ({
  p_before_created: c?.created_at ?? undefined,
  p_before_id: c?.id ?? undefined,
});

export async function fetchHomeFeed(
  client: VyboraClient,
  cursor?: TimeCursor | null,
): Promise<PostCard[]> {
  return unwrap(await client.rpc('feed_home', { ...cursorArgs(cursor), p_limit: PAGE.home })).map(
    toPostCard,
  );
}

export async function fetchExplore(
  client: VyboraClient,
  mode: 'trending' | 'latest',
  cursor?: ScoreCursor | TimeCursor | null,
): Promise<PostCard[]> {
  const score = cursor && 'score' in cursor ? cursor.score : undefined;
  return unwrap(
    await client.rpc('feed_explore', {
      p_mode: mode,
      p_before_score: score,
      ...cursorArgs(cursor),
      p_limit: PAGE.explore,
    }),
  ).map(toPostCard);
}

export async function fetchReels(
  client: VyboraClient,
  cursor?: TimeCursor | null,
): Promise<PostCard[]> {
  return unwrap(await client.rpc('feed_reels', { ...cursorArgs(cursor), p_limit: PAGE.reels })).map(
    toPostCard,
  );
}

export async function fetchProfilePosts(
  client: VyboraClient,
  authorId: string,
  kind: PostKind | null,
  cursor?: TimeCursor | null,
): Promise<PostCard[]> {
  return unwrap(
    await client.rpc('feed_profile', {
      p_author: authorId,
      p_kind: kind ?? undefined,
      ...cursorArgs(cursor),
      p_limit: PAGE.profile,
    }),
  ).map(toPostCard);
}

export async function fetchHashtagFeed(
  client: VyboraClient,
  tag: string,
  cursor?: TimeCursor | null,
): Promise<PostCard[]> {
  return unwrap(
    await client.rpc('feed_hashtag', { p_tag: tag, ...cursorArgs(cursor), p_limit: PAGE.hashtag }),
  ).map(toPostCard);
}

export async function fetchSaved(
  client: VyboraClient,
  cursor?: TimeCursor | null,
): Promise<PostCard[]> {
  return unwrap(await client.rpc('feed_saved', { ...cursorArgs(cursor), p_limit: PAGE.saved })).map(
    toPostCard,
  );
}

export async function fetchPost(client: VyboraClient, id: string): Promise<PostCard | null> {
  const rows = unwrap(await client.rpc('get_post', { p_id: id }));
  return rows[0] ? toPostCard(rows[0]) : null;
}

export interface NewPostMedia {
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  alt_text?: string | null;
}

/** Atomic create: post + media rows in one database transaction. */
export async function createPost(
  client: VyboraClient,
  input: { caption: string; media: NewPostMedia[]; kind: PostKind; commentsEnabled: boolean },
): Promise<string> {
  return unwrap(
    await client.rpc('create_post', {
      p_caption: input.caption,
      p_media:
        input.media as unknown as Database['public']['Functions']['create_post']['Args']['p_media'],
      p_kind: input.kind,
      p_comments_enabled: input.commentsEnabled,
    }),
  ) as string;
}

export async function updatePost(
  client: VyboraClient,
  id: string,
  patch: { caption?: string; comments_enabled?: boolean },
) {
  const rows = unwrap(await client.from('posts').update(patch).eq('id', id).select('id'));
  if (!rows.length) throw new Error('forbidden');
}

export async function deletePost(client: VyboraClient, id: string) {
  const rows = unwrap(await client.from('posts').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('forbidden');
}

export async function setLiked(
  client: VyboraClient,
  userId: string,
  postId: string,
  liked: boolean,
) {
  if (liked) {
    const { error } = await client.from('likes').insert({ user_id: userId, post_id: postId });
    // Already liked (e.g. from another device) is a success for an idempotent toggle.
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await client.from('likes').delete().eq('user_id', userId).eq('post_id', postId));
  }
}

export async function setSaved(
  client: VyboraClient,
  userId: string,
  postId: string,
  saved: boolean,
) {
  if (saved) {
    const { error } = await client.from('saved_posts').insert({ user_id: userId, post_id: postId });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await client.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId));
  }
}

export async function searchHashtags(client: VyboraClient, query: string) {
  if (!query.trim()) return [];
  return unwrap(await client.rpc('search_hashtags', { p_query: query, p_limit: 15 })).map((h) => ({
    id: h.id!,
    tag: h.tag!,
    post_count: h.post_count ?? 0,
  }));
}

export async function reportContent(
  client: VyboraClient,
  userId: string,
  input: {
    target_type: 'post' | 'comment' | 'profile' | 'story';
    target_id: string;
    reason: string;
    details?: string;
  },
) {
  const { error } = await client.from('reports').insert({
    reporter_id: userId,
    target_type: input.target_type,
    target_id: input.target_id,
    reason: input.reason,
    details: input.details || null,
  });
  // Already reported and still open → treat as success.
  if (error && error.code !== '23505') throw error;
}
