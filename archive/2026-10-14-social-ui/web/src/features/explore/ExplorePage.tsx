import { fetchExplore, PAGE, qk } from '@vybora/api';
import {
  flattenUnique,
  scoreCursorOf,
  timeCursorOf,
  type ScoreCursor,
  type TimeCursor,
} from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Compass, Flame, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { EmptyState, ErrorState, Tabs } from '@/components/ui/States';
import { PostGrid, PostGridSkeleton } from '@/features/posts/PostGrid';
import { supabase } from '@/lib/supabase';

type Mode = 'trending' | 'latest';

export default function ExplorePage() {
  const [mode, setMode] = useState<Mode>('trending');
  const q = useInfiniteQuery({
    queryKey: qk.feed.explore(mode),
    queryFn: ({ pageParam }) => fetchExplore(supabase, mode, pageParam),
    initialPageParam: null as ScoreCursor | TimeCursor | null,
    getNextPageParam: (last) =>
      mode === 'trending' ? scoreCursorOf(last, PAGE.explore) : timeCursorOf(last, PAGE.explore),
  });
  const posts = flattenUnique(q.data?.pages);

  return (
    <div className="mx-auto max-w-[935px] px-0 py-6 sm:px-4">
      <div className="mb-5 flex flex-col gap-4 px-4 sm:flex-row sm:items-end sm:justify-between sm:px-0">
        <div>
          <h1 className="font-display text-3xl font-semibold">Explore</h1>
          <p className="text-sm text-muted">
            {mode === 'trending'
              ? 'Most engaged public posts this week (likes + 2× comments).'
              : 'The newest public posts.'}
          </p>
        </div>
        <Link
          to="/search"
          className="flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-subtle sm:w-64"
        >
          <Search size={16} /> Search people and tags
        </Link>
      </div>
      <div className="mb-5 px-4 sm:max-w-xs sm:px-0">
        <Tabs
          label="Explore mode"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'trending', label: 'Trending', icon: <Flame size={15} /> },
            { value: 'latest', label: 'Latest', icon: <Sparkles size={15} /> },
          ]}
        />
      </div>
      {q.isPending && <PostGridSkeleton count={12} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {!q.isPending && !q.isError && posts.length === 0 && (
        <EmptyState
          icon={<Compass size={28} />}
          title="Nothing to explore yet"
          body="As people share public posts, they’ll appear here."
        />
      )}
      <PostGrid posts={posts} />
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        error={q.isFetchNextPageError}
        onLoad={() => void q.fetchNextPage()}
      />
    </div>
  );
}
