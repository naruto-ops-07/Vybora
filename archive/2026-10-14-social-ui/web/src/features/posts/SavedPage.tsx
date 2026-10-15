import { fetchSaved, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { LoadMore } from '@/components/LoadMore';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import { PostGrid, PostGridSkeleton } from './PostGrid';

export default function SavedPage() {
  const q = useInfiniteQuery({
    queryKey: qk.feed.saved,
    queryFn: ({ pageParam }) => fetchSaved(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.saved),
  });
  const posts = flattenUnique(q.data?.pages);
  return (
    <div className="mx-auto max-w-[935px] px-0 py-6 sm:px-4">
      <h1 className="mb-1 px-4 font-display text-3xl font-semibold sm:px-0">Saved</h1>
      <p className="mb-6 px-4 text-sm text-muted sm:px-0">Only you can see what you’ve saved.</p>
      {q.isPending && <PostGridSkeleton />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {!q.isPending && posts.length === 0 && (
        <EmptyState
          icon={<Bookmark size={28} />}
          title="Nothing saved yet"
          body="Tap the bookmark on any post to keep it here."
        />
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
