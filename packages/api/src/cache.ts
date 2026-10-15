import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { PostCard } from '@vybora/types';

type FeedData = InfiniteData<PostCard[]>;
export type CacheSnapshot = [QueryKey, unknown][];

/**
 * Apply an update to a post wherever it is cached (every feed page and the
 * post detail). Returns a snapshot so optimistic changes can be rolled back.
 * Returning null from `update` removes the post (e.g. after deletion).
 */
export function updatePostEverywhere(
  qc: QueryClient,
  postId: string,
  update: (p: PostCard) => PostCard | null,
): CacheSnapshot {
  const snapshot: CacheSnapshot = [
    ...qc.getQueriesData({ queryKey: ['feed'] }),
    ...qc.getQueriesData({ queryKey: ['post', postId] }),
  ];

  qc.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data?.pages) return data;
    let changed = false;
    const pages = data.pages.map((page) =>
      page.flatMap((p) => {
        if (p.id !== postId) return [p];
        changed = true;
        const next = update(p);
        return next ? [next] : [];
      }),
    );
    return changed ? { ...data, pages } : data;
  });

  qc.setQueryData<PostCard | null>(['post', postId], (p) => (p ? update(p) : p));
  return snapshot;
}

export function restoreSnapshot(qc: QueryClient, snapshot: CacheSnapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}
