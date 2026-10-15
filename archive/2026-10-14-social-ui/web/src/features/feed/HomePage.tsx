import { fetchHomeFeed, PAGE, qk } from '@vybora/api';
import { flattenUnique, timeCursorOf, type TimeCursor } from '@vybora/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { LoadMore } from '@/components/LoadMore';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PostCardSkeleton, PostCardView } from '@/features/posts/PostCard';
import { StoryTray } from '@/features/stories/StoryTray';
import { supabase } from '@/lib/supabase';
import { SuggestedAccounts } from './SuggestedAccounts';

export default function HomePage() {
  const feed = useInfiniteQuery({
    queryKey: qk.feed.home,
    queryFn: ({ pageParam }) => fetchHomeFeed(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.home),
  });
  const posts = flattenUnique(feed.data?.pages);

  return (
    <div className="mx-auto flex max-w-[960px] gap-10 px-0 pt-2 sm:px-4 md:pt-6">
      <div className="mx-auto w-full max-w-[520px] min-w-0">
        <div className="px-4 sm:px-0">
          <StoryTray />
        </div>
        <h1 className="sr-only">Home feed</h1>
        <div className="mt-2 space-y-4 sm:space-y-6">
          {feed.isPending && (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          )}
          {feed.isError && <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />}
          {!feed.isPending && !feed.isError && posts.length === 0 && (
            <div className="rounded-[22px] border border-line bg-surface">
              <EmptyState
                icon={<Users size={28} />}
                title="Your feed is waiting"
                body="Follow a few creators and their posts will show up here."
              />
              <div className="px-6 pb-8">
                <SuggestedAccounts limit={5} title="Start with these accounts" />
              </div>
            </div>
          )}
          {posts.map((p) => (
            <PostCardView key={p.id} post={p} />
          ))}
          <LoadMore
            hasMore={!!feed.hasNextPage}
            loading={feed.isFetchingNextPage}
            error={feed.isFetchNextPageError}
            onLoad={() => void feed.fetchNextPage()}
          />
          {!feed.hasNextPage && posts.length > 0 && (
            <p className="py-8 text-center text-sm text-subtle">You’re all caught up.</p>
          )}
        </div>
      </div>
      <aside className="hidden w-[300px] shrink-0 pt-6 lg:block">
        <div className="sticky top-8">
          <SuggestedAccounts />
        </div>
      </aside>
    </div>
  );
}
