/** Keyset cursor matching the SQL feeds' ORDER BY (created_at desc, id desc). */
export interface TimeCursor {
  created_at: string;
  id: string;
}

/** Trending cursor matching feed_explore('trending'). */
export interface ScoreCursor extends TimeCursor {
  score: number;
}

/**
 * Transparent, deterministic engagement score used by Explore → Trending.
 * Must stay identical to the SQL expression `like_count + 2 * comment_count`.
 */
export function engagementScore(post: { like_count: number; comment_count: number }): number {
  return post.like_count + 2 * post.comment_count;
}

export function timeCursorOf<T extends TimeCursor>(
  items: readonly T[],
  pageSize: number,
): TimeCursor | null {
  if (items.length < pageSize) return null;
  const last = items[items.length - 1];
  return last ? { created_at: last.created_at, id: last.id } : null;
}

export function scoreCursorOf<T extends TimeCursor & { like_count: number; comment_count: number }>(
  items: readonly T[],
  pageSize: number,
): ScoreCursor | null {
  if (items.length < pageSize) return null;
  const last = items[items.length - 1];
  return last ? { created_at: last.created_at, id: last.id, score: engagementScore(last) } : null;
}

/**
 * Flatten infinite-query pages, dropping duplicates by id (first occurrence
 * wins). Protects against rows shifting between pages when counters change.
 */
export function flattenUnique<T extends { id: string }>(
  pages: readonly (readonly T[])[] | undefined,
): T[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Compare two rows by the feed order; negative if a comes first. */
export function compareFeedOrder(a: TimeCursor, b: TimeCursor): number {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}
