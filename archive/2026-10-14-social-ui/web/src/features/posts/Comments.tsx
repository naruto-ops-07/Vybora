import { addComment, COMMENT_PAGE, deleteComment, fetchComments, qk } from '@vybora/api';
import { canDeleteComment, formatRelativeTime, friendlyError } from '@vybora/core';
import type { CommentView, PostCard } from '@vybora/types';
import { LIMITS } from '@vybora/validation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { RichText } from '@/components/ui/RichText';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { updatePostEverywhere } from './postCache';
import { ReportDialog } from './ReportDialog';

type Cursor = { created_at: string; id: string } | null;

function useCommentPage(postId: string, parentId: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.comments(postId, parentId),
    queryFn: ({ pageParam }) => fetchComments(supabase, postId, parentId, pageParam),
    initialPageParam: null as Cursor,
    getNextPageParam: (last) =>
      last.length < COMMENT_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
    enabled,
  });
}

function CommentRow({
  c,
  post,
  onReply,
  isReply,
}: {
  c: CommentView;
  post: PostCard;
  onReply: (c: CommentView) => void;
  isReply?: boolean;
}) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [showReplies, setShowReplies] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reporting, setReporting] = useState(false);
  const replies = useCommentPage(post.id, c.id, showReplies);

  const remove = useMutation({
    mutationFn: () => deleteComment(supabase, c.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comments', post.id] });
      updatePostEverywhere(qc, post.id, (p) => ({
        ...p,
        comment_count: Math.max(0, p.comment_count - 1 - c.reply_count),
      }));
      setConfirm(false);
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <li className="group">
      <div className="flex gap-3">
        <Link to={`/u/${c.author_username}`} className="shrink-0">
          <Avatar path={c.author_avatar_path} name={c.author_username} size={isReply ? 28 : 34} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm">
            <Link to={`/u/${c.author_username}`} className="mr-1.5 font-semibold">
              {c.author_username}
            </Link>
            <RichText text={c.body} />
          </p>
          <div className="mt-1 flex items-center gap-4 text-xs text-subtle">
            <time dateTime={c.created_at}>{formatRelativeTime(c.created_at)}</time>
            {userId && post.comments_enabled && (
              <button
                type="button"
                className="font-semibold hover:text-ink"
                onClick={() => onReply(c)}
              >
                Reply
              </button>
            )}
            {canDeleteComment(userId, c, post.author_id) && (
              <button
                type="button"
                aria-label="Delete comment"
                className="opacity-100 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={13} />
              </button>
            )}
            {userId && c.author_id !== userId && (
              <button
                type="button"
                aria-label="Report comment"
                className="opacity-100 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                onClick={() => setReporting(true)}
              >
                <Flag size={13} />
              </button>
            )}
          </div>
          {!isReply && c.reply_count > 0 && (
            <button
              type="button"
              className="mt-2 flex items-center gap-2 text-xs font-semibold text-subtle hover:text-ink"
              onClick={() => setShowReplies((s) => !s)}
            >
              <span className="h-px w-6 bg-line-strong" />
              {showReplies ? 'Hide replies' : `View replies (${c.reply_count})`}
            </button>
          )}
          {showReplies && (
            <ul className="mt-3 space-y-3">
              {replies.data?.pages.flat().map((r) => (
                <CommentRow key={r.id} c={r} post={post} onReply={() => onReply(c)} isReply />
              ))}
              {replies.hasNextPage && (
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() => void replies.fetchNextPage()}
                >
                  More replies
                </button>
              )}
            </ul>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete comment?"
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        targetType="comment"
        targetId={c.id}
      />
    </li>
  );
}

export function Comments({ post }: { post: PostCard }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const threads = useCommentPage(post.id, null);
  const comments = threads.data?.pages.flat() ?? [];

  const send = useMutation({
    mutationFn: () =>
      addComment(supabase, userId!, { postId: post.id, body, parentId: replyTo?.id ?? null }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['comments', post.id] });
      updatePostEverywhere(qc, post.id, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
      setReplyTo(null);
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() || send.isPending) return;
    send.mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {threads.isPending && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        )}
        {threads.isError && (
          <ErrorState error={threads.error} onRetry={() => void threads.refetch()} />
        )}
        {!threads.isPending && comments.length === 0 && (
          <EmptyState
            className="py-10"
            title="No comments yet"
            body={post.comments_enabled ? 'Start the conversation.' : 'Comments are turned off.'}
          />
        )}
        <ul className="space-y-4">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              c={c}
              post={post}
              onReply={(target) => {
                setReplyTo(target);
                setBody(`@${target.author_username} `);
              }}
            />
          ))}
        </ul>
        <LoadMore
          hasMore={!!threads.hasNextPage}
          loading={threads.isFetchingNextPage}
          onLoad={() => void threads.fetchNextPage()}
        />
      </div>

      {userId && post.comments_enabled && (
        <form onSubmit={submit} className="border-t border-line px-4 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-muted">
              Replying to @{replyTo.author_username}
              <button
                type="button"
                className="font-semibold"
                onClick={() => {
                  setReplyTo(null);
                  setBody('');
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="comment-input" className="sr-only">
              Add a comment
            </label>
            <input
              id="comment-input"
              value={body}
              maxLength={LIMITS.comment}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              className="h-11 flex-1 rounded-xl border border-line bg-surface-muted px-3.5 text-sm focus:border-accent focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-accent"
              disabled={!body.trim()}
              loading={send.isPending}
            >
              Post
            </Button>
          </div>
        </form>
      )}
      {!post.comments_enabled && (
        <p className="border-t border-line px-4 py-3 text-center text-sm text-subtle">
          Comments are turned off for this post.
        </p>
      )}
    </div>
  );
}
