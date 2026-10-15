import { QueryClient } from '@tanstack/react-query';
import type { PostCard } from '@vybora/types';
import { describe, expect, it, vi } from 'vitest';
import { restoreSnapshot, updatePostEverywhere } from './cache';
import type { VyboraClient } from './client';
import { unwrap } from './client';
import { clearSignedUrlCache, createSignedUrlBatcher } from './media';
import { toPostCard } from './posts';

const row = {
  id: 'p1',
  author_id: 'a1',
  kind: 'post',
  caption: null,
  comments_enabled: true,
  status: 'published',
  like_count: 3,
  comment_count: null,
  created_at: '2026-10-09T10:00:00Z',
  updated_at: '2026-10-09T10:00:00Z',
  author_is_private: false,
  author: { id: 'a1', username: 'maya', display_name: '', avatar_path: null, is_private: false },
  media: [
    {
      id: 'm2',
      position: 1,
      storage_path: 'a1/2.jpg',
      media_type: 'image',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
      duration_ms: null,
      alt_text: null,
    },
    {
      id: 'm1',
      position: 0,
      storage_path: 'a1/1.jpg',
      media_type: 'image',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
      duration_ms: null,
      alt_text: null,
    },
  ],
  liked_by_me: null,
  saved_by_me: true,
};

describe('toPostCard', () => {
  it('normalizes nullable view columns and orders media by position', () => {
    const card = toPostCard(row as never);
    expect(card.caption).toBe('');
    expect(card.comment_count).toBe(0);
    expect(card.liked_by_me).toBe(false);
    expect(card.saved_by_me).toBe(true);
    expect(card.media.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('unwrap', () => {
  it('throws PostgREST errors and returns data otherwise', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
    expect(() => unwrap({ data: null, error: { message: 'boom' } })).toThrow();
  });
});

describe('createSignedUrlBatcher', () => {
  it('coalesces concurrent lookups into one request and caches results', async () => {
    clearSignedUrlCache();
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://cdn/${p}?token=x`, error: null })),
      error: null,
    }));
    const client = { storage: { from: () => ({ createSignedUrls }) } } as unknown as VyboraClient;
    const get = createSignedUrlBatcher(client, 'media', 5);
    const urls = await Promise.all([get('a/1.jpg'), get('a/2.jpg'), get('a/1.jpg')]);
    expect(urls).toEqual([
      'https://cdn/a/1.jpg?token=x',
      'https://cdn/a/2.jpg?token=x',
      'https://cdn/a/1.jpg?token=x',
    ]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0]![0]).toEqual(['a/1.jpg', 'a/2.jpg']);
    await get('a/2.jpg');
    expect(createSignedUrls).toHaveBeenCalledTimes(1); // served from cache
  });

  it('rejects when the server returns no URL (e.g. access denied by Storage RLS)', async () => {
    clearSignedUrlCache();
    const client = {
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((p) => ({ path: p, signedUrl: null, error: 'not found' })),
            error: null,
          }),
        }),
      },
    } as unknown as VyboraClient;
    await expect(createSignedUrlBatcher(client, 'media', 1)('private/x.jpg')).rejects.toThrow(
      'media_unavailable',
    );
  });
});

describe('updatePostEverywhere', () => {
  it('updates every cached copy and can be rolled back', () => {
    const qc = new QueryClient();
    const post = toPostCard(row as never);
    qc.setQueryData(['feed', 'home'], { pages: [[post]], pageParams: [null] });
    qc.setQueryData(['feed', 'explore', 'latest'], { pages: [[post]], pageParams: [null] });
    qc.setQueryData(['post', 'p1'], post);

    const snapshot = updatePostEverywhere(qc, 'p1', (p) => ({
      ...p,
      like_count: 4,
      liked_by_me: true,
    }));
    const home = qc.getQueryData<{ pages: PostCard[][] }>(['feed', 'home'])!;
    expect(home.pages[0]![0]!.like_count).toBe(4);
    expect(qc.getQueryData<PostCard>(['post', 'p1'])!.liked_by_me).toBe(true);

    restoreSnapshot(qc, snapshot);
    expect(
      qc.getQueryData<{ pages: PostCard[][] }>(['feed', 'explore', 'latest'])!.pages[0]![0]!
        .like_count,
    ).toBe(3);
  });

  it('removes deleted posts from feeds', () => {
    const qc = new QueryClient();
    const post = toPostCard(row as never);
    qc.setQueryData(['feed', 'home'], { pages: [[post]], pageParams: [null] });
    updatePostEverywhere(qc, 'p1', () => null);
    expect(qc.getQueryData<{ pages: PostCard[][] }>(['feed', 'home'])!.pages[0]).toEqual([]);
  });
});
