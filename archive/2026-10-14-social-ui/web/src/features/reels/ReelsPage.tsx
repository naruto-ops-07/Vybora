import { fetchReels, follow, PAGE, qk } from '@vybora/api';
import {
  flattenUnique,
  formatCount,
  friendlyError,
  timeCursorOf,
  type TimeCursor,
} from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { RichText } from '@/components/ui/RichText';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { sharePost } from '@/features/posts/PostCard';
import { usePostActions } from '@/features/posts/usePostActions';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

function Reel({
  post,
  active,
  preload,
  muted,
  onToggleMute,
}: {
  post: PostCard;
  active: boolean;
  preload: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const { userId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const media = post.media[0];
  // Only the active reel and its neighbours fetch a signed URL / video data.
  const { data: url } = useSignedUrl(preload ? media?.storage_path : null);
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [followed, setFollowed] = useState(false);
  const { like, save } = usePostActions(post);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !paused) void v.play().catch(() => setPaused(true));
    else v.pause();
  }, [active, paused, url]);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      if (video.current) video.current.currentTime = 0;
    }
  }, [active]);

  const followMut = useMutation({
    mutationFn: () => follow(supabase, userId!, post.author_id),
    onSuccess: () => {
      setFollowed(true);
      void qc.invalidateQueries({ queryKey: qk.feed.home });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <section
      className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black"
      aria-label={`Reel by ${post.author.username}`}
    >
      <div className="relative h-full w-full max-w-[min(100%,calc(100dvh*9/16))] overflow-hidden bg-black md:rounded-[22px]">
        {url ? (
          <video
            ref={video}
            src={url}
            loop
            playsInline
            muted={muted}
            preload={active ? 'auto' : 'metadata'}
            className="h-full w-full object-contain"
            aria-label={media?.alt_text || post.caption || `Reel by ${post.author.username}`}
            onTimeUpdate={(e) =>
              setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))
            }
            onClick={() => setPaused((p) => !p)}
          />
        ) : (
          <div className="h-full w-full" />
        )}

        {paused && active && (
          <button
            type="button"
            onClick={() => setPaused(false)}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="rounded-full bg-black/50 p-5 text-white">
              <Play size={36} className="fill-white" />
            </span>
          </button>
        )}

        <div className="absolute right-3 top-3 flex gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play' : 'Pause'}
            className="rounded-full bg-black/50 p-2 text-white"
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="rounded-full bg-black/50 p-2 text-white"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pb-6 pr-20 text-white">
          <div className="mb-2 flex items-center gap-2.5">
            <Link to={`/u/${post.author.username}`} className="flex items-center gap-2.5">
              <Avatar path={post.author.avatar_path} name={post.author.username} size={34} />
              <span className="text-sm font-semibold">{post.author.username}</span>
            </Link>
            {userId && userId !== post.author_id && !followed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-white/70 bg-transparent px-2.5 text-white hover:bg-white/10"
                onClick={() => followMut.mutate()}
                loading={followMut.isPending}
              >
                Follow
              </Button>
            )}
          </div>
          {post.caption && (
            <p className="line-clamp-3 text-sm [&_a]:text-white [&_a]:underline">
              <RichText text={post.caption} />
            </p>
          )}
        </div>

        <div className="absolute bottom-6 right-2 flex flex-col items-center gap-4 text-white">
          <button
            type="button"
            aria-label={post.liked_by_me ? 'Unlike' : 'Like'}
            aria-pressed={post.liked_by_me}
            onClick={() => userId && like.mutate(!post.liked_by_me)}
            className="flex flex-col items-center gap-1"
          >
            <Heart size={28} className={cn(post.liked_by_me && 'fill-coral text-coral')} />
            <span className="text-xs font-semibold">{formatCount(post.like_count)}</span>
          </button>
          <Link
            to={`/p/${post.id}`}
            aria-label="Comments"
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle size={28} />
            <span className="text-xs font-semibold">{formatCount(post.comment_count)}</span>
          </Link>
          <button type="button" aria-label="Share" onClick={() => sharePost(post, toast)}>
            <Send size={26} />
          </button>
          <button
            type="button"
            aria-label={post.saved_by_me ? 'Remove from saved' : 'Save'}
            aria-pressed={post.saved_by_me}
            onClick={() => userId && save.mutate(!post.saved_by_me)}
          >
            <Bookmark size={26} className={cn(post.saved_by_me && 'fill-white')} />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20" aria-hidden="true">
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </section>
  );
}

export default function ReelsPage() {
  const q = useInfiniteQuery({
    queryKey: qk.feed.reels,
    queryFn: ({ pageParam }) => fetchReels(supabase, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.reels),
  });
  const reels = flattenUnique(q.data?.pages);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const container = useRef<HTMLDivElement>(null);

  // Determine the active reel by which section fills the viewport.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6)
            setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reels.length]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (active >= reels.length - 2 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [active, reels.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const goTo = useCallback((i: number) => {
    const el = container.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    el?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goTo(Math.min(active + 1, reels.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goTo(Math.max(active - 1, 0));
      } else if (e.key === 'm') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, reels.length, goTo]);

  if (q.isPending)
    return (
      <div className="h-dvh bg-black">
        <PageSpinner label="Loading reels" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!reels.length)
    return (
      <EmptyState
        icon={<Clapperboard size={28} />}
        title="No reels yet"
        body="Share a short vertical video and choose “Share as a reel”."
        action={
          <Link to="/create">
            <Button>Create a reel</Button>
          </Link>
        }
      />
    );

  return (
    <div className="relative">
      <h1 className="sr-only">Reels</h1>
      <div
        ref={container}
        className="scrollbar-none h-[calc(100dvh-4rem)] snap-y snap-mandatory overflow-y-scroll bg-black md:h-dvh md:py-4"
      >
        {reels.map((r, i) => (
          <div key={r.id} data-index={i} className="h-full w-full snap-start md:py-2">
            <Reel
              post={r}
              active={i === active}
              preload={Math.abs(i - active) <= 1}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
            />
          </div>
        ))}
      </div>
      <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous reel"
          disabled={active === 0}
          onClick={() => goTo(active - 1)}
        >
          <ChevronUp size={20} />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next reel"
          disabled={active >= reels.length - 1}
          onClick={() => goTo(active + 1)}
        >
          <ChevronDown size={20} />
        </Button>
      </div>
    </div>
  );
}
