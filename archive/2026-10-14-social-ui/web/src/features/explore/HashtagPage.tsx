import { fetchHashtagFeed, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useParams } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PostGrid, PostGridSkeleton } from '@/features/posts/PostGrid';
import { supabase } from '@/lib/supabase';

export default function HashtagPage() {
  const { tag = '' } = useParams();
  const clean = tag.toLowerCase().replace(/^#/, '');
  const q = useInfiniteQuery({
    queryKey: qk.feed.hashtag(clean),
    queryFn: ({ pageParam }) => fetchHashtagFeed(supabase, clean, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.hashtag),
  });
  const posts = flattenUnique(q.data?.pages);
  return (
    <div className="mx-auto max-w-[935px] px-0 py-6 sm:px-4">
      <header className="mb-6 flex items-center gap-5 px-4 sm:px-0">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Hash size={34} />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold">#{clean}</h1>
          <p className="text-sm text-muted">Posts you can see, newest first.</p>
        </div>
      </header>
      {q.isPending && <PostGridSkeleton />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {!q.isPending && posts.length === 0 && (
        <EmptyState title="No posts yet" body={`Be the first to share with #${clean}.`} />
      )}
      <PostGrid posts={posts} />
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onLoad={() => void q.fetchNextPage()}
      />
    </div>
  );
}
