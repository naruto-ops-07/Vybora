import type { MediaItem } from '@vybora/types';
import { ChevronLeft, ChevronRight, ImageOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/States';
import { useInView } from '@/hooks/useInView';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/cn';

export function MediaUnavailable({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-muted text-subtle',
        className,
      )}
    >
      <ImageOff size={28} />
      <span className="text-xs">Media unavailable</span>
    </div>
  );
}

export function SignedImage({
  path,
  alt,
  className,
  eager,
}: {
  path: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const { data: url, isError } = useSignedUrl(path);
  const [loaded, setLoaded] = useState(false);
  if (isError) return <MediaUnavailable className={className} />;
  return (
    <div className={cn('relative h-full w-full', className)}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      {url && (
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  );
}

/** Feed video: only loads when near the viewport, autoplays muted while visible. */
export function SignedVideo({
  path,
  className,
  label,
}: {
  path: string;
  className?: string;
  label: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.6 });
  const { data: url, isError } = useSignedUrl(path);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (inView) void v.play().catch(() => undefined);
    else v.pause();
  }, [inView, url]);

  if (isError) return <MediaUnavailable className={className} />;
  return (
    <div ref={ref} className={cn('relative h-full w-full bg-black', className)}>
      {url && (
        <video
          ref={video}
          src={inView ? url : undefined}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-label={label}
          className="h-full w-full object-cover"
          onClick={(e) => {
            const v = e.currentTarget;
            if (v.paused) void v.play();
            else v.pause();
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-3 right-3 rounded-full bg-black/60 p-2 text-white backdrop-blur"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}

export function MediaFrame({
  item,
  eager,
  label,
}: {
  item: MediaItem;
  eager?: boolean;
  label: string;
}) {
  return item.media_type === 'video' ? (
    <SignedVideo path={item.storage_path} label={item.alt_text || label} />
  ) : (
    <SignedImage path={item.storage_path} alt={item.alt_text || label} eager={eager} />
  );
}

/** Scroll-snap carousel with buttons, dots and keyboard support. */
export function Carousel({
  media,
  aspect,
  label,
  onDoubleClick,
}: {
  media: MediaItem[];
  aspect: number;
  label: string;
  onDoubleClick?: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(media.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      className="group relative overflow-hidden bg-surface-muted"
      style={{ aspectRatio: aspect }}
      onDoubleClick={onDoubleClick}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div
        ref={track}
        className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {media.map((m, i) => (
          <div
            key={m.id}
            className="h-full w-full shrink-0 snap-center"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${media.length}`}
          >
            <MediaFrame item={m} eager={i === 0} label={label} />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <>
          {index > 0 && (
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(index - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-midnight opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {index < media.length - 1 && (
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(index + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-midnight opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
            {index + 1}/{media.length}
          </div>
          <div
            className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
            aria-hidden="true"
          >
            {media.map((m, i) => (
              <span
                key={m.id}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
