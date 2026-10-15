import {
  fetchFollowRequests,
  fetchNotifications,
  markAllNotificationsRead,
  NOTIFICATION_PAGE,
  qk,
  respondToFollowRequest,
} from '@vybora/api';
import { formatRelativeTime, friendlyError, truncate } from '@vybora/core';
import type { NotificationView } from '@vybora/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

function describe(n: NotificationView): { text: string; href: string } {
  const post = n.post_id ? `/p/${n.post_id}` : '#';
  const actorHref = n.actor ? `/u/${n.actor.username}` : '#';
  switch (n.type) {
    case 'follow':
      return { text: 'started following you.', href: actorHref };
    case 'follow_request':
      return { text: 'requested to follow you.', href: actorHref };
    case 'follow_accept':
      return { text: 'accepted your follow request.', href: actorHref };
    case 'like':
      return { text: 'liked your post.', href: post };
    case 'comment':
      return { text: `commented: ${truncate(n.body ?? '', 80)}`, href: post };
    case 'reply':
      return { text: `replied: ${truncate(n.body ?? '', 80)}`, href: post };
    case 'mention':
      return {
        text: n.comment_id ? 'mentioned you in a comment.' : 'mentioned you in a post.',
        href: post,
      };
    case 'moderation':
      return { text: n.body ?? 'There’s an update about your account.', href: post };
    case 'message':
      return {
        text: 'sent you a message.',
        href: n.conversation_id ? `/messages/${n.conversation_id}` : '/messages',
      };
  }
}

function FollowRequests() {
  const { userId } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.followRequests, queryFn: () => fetchFollowRequests(supabase) });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToFollowRequest(supabase, userId, id, accept),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.followRequests });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });
  if (!q.data?.length) return null;
  return (
    <section
      aria-labelledby="requests-h"
      className="mb-6 rounded-[22px] border border-line bg-surface p-4"
    >
      <h2 id="requests-h" className="mb-3 font-semibold">
        Follow requests <span className="text-muted">({q.data.length})</span>
      </h2>
      <ul className="space-y-3">
        {q.data.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <Link to={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar path={r.avatar_path} name={r.username} size={40} />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{r.username}</p>
                <p className="truncate text-xs text-subtle">{formatRelativeTime(r.requested_at)}</p>
              </div>
            </Link>
            <Button
              size="sm"
              onClick={() => respond.mutate({ id: r.id, accept: true })}
              disabled={respond.isPending}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => respond.mutate({ id: r.id, accept: false })}
              disabled={respond.isPending}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) => fetchNotifications(supabase, pageParam),
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < NOTIFICATION_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
  });
  const items = q.data?.pages.flat() ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  // Viewing the list marks it read (after it has rendered), clearing the badge.
  useEffect(() => {
    if (!q.isSuccess || !hasUnread) return;
    const t = setTimeout(() => {
      void markAllNotificationsRead(supabase).then(() =>
        qc.invalidateQueries({ queryKey: qk.unread }),
      );
    }, 1500);
    return () => clearTimeout(t);
  }, [q.isSuccess, hasUnread, qc]);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-6">
      <h1 className="mb-5 font-display text-3xl font-semibold">Notifications</h1>
      <FollowRequests />
      {q.isPending && (
        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.isSuccess && items.length === 0 && (
        <EmptyState
          icon={<Bell size={28} />}
          title="Nothing yet"
          body="Likes, comments, follows and mentions will show up here."
        />
      )}
      <ul className="space-y-1">
        {items.map((n) => {
          const { text, href } = describe(n);
          return (
            <li key={n.id}>
              <Link
                to={href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-surface-muted',
                  !n.read_at && 'bg-accent-soft/60',
                )}
              >
                {n.type === 'moderation' ? (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger/15 text-danger">
                    <ShieldAlert size={20} />
                  </span>
                ) : (
                  <Avatar path={n.actor?.avatar_path} name={n.actor?.username ?? '?'} size={44} />
                )}
                <p className="min-w-0 flex-1 text-sm">
                  {n.actor && <span className="font-semibold">{n.actor.username} </span>}
                  <span>{text}</span>{' '}
                  <span className="text-subtle">{formatRelativeTime(n.created_at)}</span>
                </p>
                {!n.read_at && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onLoad={() => void q.fetchNextPage()}
      />
    </div>
  );
}
