import { fetchFollowList, qk, removeFollower } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function FollowListDialog({
  open,
  onClose,
  userId,
  direction,
  isMe,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  direction: 'followers' | 'following';
  isMe: boolean;
}) {
  const { userId: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useInfiniteQuery({
    queryKey: qk.followList(userId, direction),
    queryFn: ({ pageParam }) => fetchFollowList(supabase, userId, direction, pageParam),
    initialPageParam: null as { followed_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < 30
        ? null
        : { followed_at: last[last.length - 1]!.followed_at, id: last[last.length - 1]!.id },
    enabled: open,
  });
  const remove = useMutation({
    mutationFn: (followerId: string) => removeFollower(supabase, me!, followerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.followList(userId, direction) });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={direction === 'followers' ? 'Followers' : 'Following'}
      size="sm"
    >
      {q.isPending && <Skeleton className="h-12" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {!q.isPending && rows.length === 0 && (
        <EmptyState
          className="py-8"
          title={direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
        />
      )}
      <ul className="space-y-1">
        {rows.map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <Link
              to={`/u/${u.username}`}
              onClick={onClose}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar path={u.avatar_path} name={u.username} size={40} />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{u.username}</p>
                <p className="truncate text-sm text-muted">{u.display_name}</p>
              </div>
            </Link>
            {isMe && direction === 'followers' && (
              <Button
                size="sm"
                variant="secondary"
                loading={remove.isPending && remove.variables === u.id}
                onClick={() => remove.mutate(u.id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onLoad={() => void q.fetchNextPage()}
      />
    </Dialog>
  );
}
