import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useInView } from '@/hooks/useInView';

/** Infinite-scroll sentinel with an accessible manual fallback button. */
export function LoadMore({
  hasMore,
  loading,
  onLoad,
  error,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  error?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  useEffect(() => {
    if (inView && hasMore && !loading && !error) onLoad();
  }, [inView, hasMore, loading, error, onLoad]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <Spinner className="text-accent" label="Loading more" />
      ) : (
        <Button variant="ghost" size="sm" onClick={onLoad}>
          {error ? 'Retry loading more' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
