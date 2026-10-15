import { formatCount } from '@vybora/core';
import type { PostCard } from '@vybora/types';
import { Clapperboard, Copy, Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router';
import { SignedImage } from '@/components/media/Media';
import { Skeleton } from '@/components/ui/States';
import { useSignedUrl } from '@/hooks/useSignedUrl';

function VideoThumb({ path, label }: { path: string; label: string }) {
  const { data: url } = useSignedUrl(path);
  // #t=0.1 asks the browser for a poster frame without downloading the whole file.
  return url ? (
    <video
      src={`${url}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      aria-label={label}
      className="h-full w-full object-cover"
    />
  ) : (
    <Skeleton className="h-full w-full rounded-none" />
  );
}

export function PostGrid({ posts }: { posts: PostCard[] }) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 sm:gap-1.5">
      {posts.map((p) => {
        const cover = p.media[0];
        const label = p.caption
          ? `Post: ${p.caption.slice(0, 80)}`
          : `Post by ${p.author.username}`;
        return (
          <li key={p.id}>
            <Link
              to={`/p/${p.id}`}
              className="group relative block aspect-[4/5] overflow-hidden bg-surface-muted sm:rounded-xl"
              aria-label={label}
            >
              {cover &&
                (cover.media_type === 'video' ? (
                  <VideoThumb path={cover.storage_path} label={cover.alt_text || label} />
                ) : (
                  <SignedImage path={cover.storage_path} alt={cover.alt_text || label} />
                ))}
              <span className="absolute right-2 top-2 text-white drop-shadow">
                {p.kind === 'reel' ? (
                  <Clapperboard size={18} />
                ) : p.media.length > 1 ? (
                  <Copy size={18} />
                ) : null}
              </span>
              <span className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/35 text-sm font-bold text-white group-hover:flex group-focus-visible:flex">
                <span className="flex items-center gap-1.5">
                  <Heart size={18} className="fill-white" /> {formatCount(p.like_count)}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle size={18} className="fill-white" /> {formatCount(p.comment_count)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PostGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[4/5] rounded-none sm:rounded-xl" />
      ))}
    </div>
  );
}
