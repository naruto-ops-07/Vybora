import {
  feedAspectRatio,
  formatCount,
  formatRelativeTime,
  formatRelativeTimeLong,
  canEditPost,
} from '@vybora/core';
import type { PostCard as Post } from '@vybora/types';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark,
  Flag,
  Heart,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Carousel } from '@/components/media/Media';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { RichText } from '@/components/ui/RichText';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { siteUrl } from '@/lib/env';
import { EditPostDialog } from './EditPostDialog';
import { ReportDialog } from './ReportDialog';
import { usePostActions } from './usePostActions';

export function sharePost(post: Post, toast: ReturnType<typeof useToast>) {
  const url = `${siteUrl()}/p/${post.id}`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && matchMedia('(pointer: coarse)').matches) {
    void nav.share({ title: `@${post.author.username} on VYBORA`, url }).catch(() => undefined);
    return;
  }
  void navigator.clipboard.writeText(url).then(
    () => toast.show('Link copied', 'success'),
    () => toast.show(url, 'info'),
  );
}

export function PostHeader({ post, onMenu }: { post: Post; onMenu?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/u/${post.author.username}`} className="shrink-0">
        <Avatar path={post.author.avatar_path} name={post.author.username} size={36} />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <Link
          to={`/u/${post.author.username}`}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {post.author.username}
        </Link>
        <time
          dateTime={post.created_at}
          title={formatRelativeTimeLong(post.created_at)}
          className="text-xs text-subtle"
        >
          {formatRelativeTime(post.created_at)}
          {post.kind === 'reel' && ' · Reel'}
        </time>
      </div>
      {onMenu}
    </div>
  );
}

export function PostCardView({ post }: { post: Post }) {
  const { userId } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { like, save, edit, remove } = usePostActions(post);
  const [burst, setBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'report' | null>(null);
  const first = post.media[0];
  const aspect = first ? feedAspectRatio(first.width, first.height) : 1;
  const isOwner = canEditPost(userId, post);
  const requireAuth = () => {
    if (!userId) navigate(`/login?next=/p/${post.id}`);
    return !!userId;
  };

  const toggleLike = () => requireAuth() && like.mutate(!post.liked_by_me);
  const doubleTapLike = () => {
    if (!requireAuth()) return;
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    if (!post.liked_by_me) like.mutate(true);
  };

  const longCaption = post.caption.length > 140;
  const label = `Post by ${post.author.username}`;

  return (
    <article
      className="overflow-hidden border-line bg-surface sm:rounded-[22px] sm:border"
      aria-label={label}
    >
      <PostHeader
        post={post}
        onMenu={
          <Menu
            label="Post options"
            trigger={<MoreHorizontal size={20} />}
            items={[
              {
                label: 'Copy link',
                icon: <Link2 size={16} />,
                onSelect: () => sharePost(post, toast),
              },
              {
                label: 'Edit',
                icon: <Pencil size={16} />,
                onSelect: () => setDialog('edit'),
                hidden: !isOwner,
              },
              {
                label: 'Delete',
                icon: <Trash2 size={16} />,
                onSelect: () => setDialog('delete'),
                danger: true,
                hidden: !isOwner,
              },
              {
                label: 'Report',
                icon: <Flag size={16} />,
                onSelect: () => requireAuth() && setDialog('report'),
                danger: true,
                hidden: isOwner,
              },
            ]}
          />
        }
      />

      <div className="relative">
        <Carousel media={post.media} aspect={aspect} label={label} onDoubleClick={doubleTapLike} />
        <AnimatePresence>
          {burst && (
            <motion.div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.35 }}
              aria-hidden="true"
            >
              <Heart size={96} className="fill-white text-white drop-shadow-xl" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="-ml-2 flex items-center">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={post.liked_by_me}
            aria-label={post.liked_by_me ? 'Unlike' : 'Like'}
            className="rounded-xl p-2 transition-transform active:scale-90"
          >
            <Heart
              size={24}
              className={cn('transition-colors', post.liked_by_me && 'fill-coral text-coral')}
            />
          </button>
          <Link to={`/p/${post.id}`} aria-label="Comments" className="rounded-xl p-2">
            <MessageCircle size={24} />
          </Link>
          <button
            type="button"
            onClick={() => sharePost(post, toast)}
            aria-label="Share"
            className="rounded-xl p-2"
          >
            <Send size={22} />
          </button>
          <button
            type="button"
            onClick={() => requireAuth() && save.mutate(!post.saved_by_me)}
            aria-pressed={post.saved_by_me}
            aria-label={post.saved_by_me ? 'Remove from saved' : 'Save'}
            className="ml-auto rounded-xl p-2"
          >
            <Bookmark size={23} className={cn(post.saved_by_me && 'fill-ink')} />
          </button>
        </div>

        <p className="text-sm font-semibold">
          {post.like_count === 1 ? '1 like' : `${formatCount(post.like_count)} likes`}
        </p>

        {post.caption && (
          <p
            className={cn(
              'mt-1 whitespace-pre-line break-words text-sm',
              !expanded && longCaption && 'line-clamp-2',
            )}
          >
            <Link to={`/u/${post.author.username}`} className="mr-1.5 font-semibold">
              {post.author.username}
            </Link>
            <RichText text={post.caption} />
          </p>
        )}
        {longCaption && !expanded && (
          <button type="button" onClick={() => setExpanded(true)} className="text-sm text-subtle">
            more
          </button>
        )}
        {post.comment_count > 0 ? (
          <Link to={`/p/${post.id}`} className="mt-1 block text-sm text-subtle hover:text-muted">
            View{' '}
            {post.comment_count === 1
              ? '1 comment'
              : `all ${formatCount(post.comment_count)} comments`}
          </Link>
        ) : (
          post.comments_enabled && (
            <Link to={`/p/${post.id}`} className="mt-1 block text-sm text-subtle hover:text-muted">
              Add a comment…
            </Link>
          )
        )}
      </div>

      <EditPostDialog
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
        post={post}
        saving={edit.isPending}
        onSave={(patch) => edit.mutate(patch, { onSuccess: () => setDialog(null) })}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Delete this post?"
        description="This permanently removes the post, its comments and likes."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setDialog(null) })}
      />
      <ReportDialog
        open={dialog === 'report'}
        onClose={() => setDialog(null)}
        targetType="post"
        targetId={post.id}
      />
    </article>
  );
}

export function PostCardSkeleton() {
  return (
    <div
      className="overflow-hidden border-line bg-surface sm:rounded-[22px] sm:border"
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-2.5 w-14 rounded" />
        </div>
      </div>
      <div className="skeleton aspect-[4/5] w-full" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
      </div>
    </div>
  );
}
