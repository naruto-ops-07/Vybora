import { NumberCircleOneIcon, XIcon } from '@phosphor-icons/react';
import type { LocalMessage } from '@vybora/e2ee';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useMessageKinds } from './context';

const what = (kind: string) => (kind === 'video' ? 'video' : 'photo');

/**
 * A view-once photo or video in the thread. Unopened (received): one "Tap to
 * view". Opened, or my own copy: just what it was. Never download, forward or copy.
 */
export function ViewOnceContent({
  message: m,
  mine,
  filled,
  selecting,
}: {
  message: LocalMessage;
  mine: boolean;
  filled: boolean;
  selecting?: boolean;
}) {
  const kinds = useMessageKinds();
  const vo = m.viewOnce!;
  const label = `View once ${what(vo.kind)}`;
  const open = !mine && !vo.consumed;
  return (
    <div className="flex min-w-[13rem] items-center gap-3 py-0.5" data-view-once="">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px]',
          open ? (filled ? 'border-current' : 'border-accent text-accent') : 'border-dashed',
          !open && (filled ? 'border-current/60' : 'border-line-strong text-muted'),
        )}
        aria-hidden="true"
      >
        <NumberCircleOneIcon size={22} weight={open ? 'fill' : 'regular'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{mine || open ? label : 'Opened'}</span>
        {mine ? (
          <span className={cn('block text-xs', !filled && 'text-muted')}>Opened</span>
        ) : open ? null : (
          <span className={cn('block text-xs', !filled && 'text-muted')}>{label}</span>
        )}
      </span>
      {open && (
        <button
          type="button"
          onClick={() => !selecting && kinds.onOpenViewOnce(m)}
          className={cn(
            'touch-target min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150',
            filled
              ? 'border-current hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]'
              : 'border-accent text-accent hover:bg-accent-soft',
          )}
        >
          Tap to view
        </button>
      )}
    </div>
  );
}

export interface ViewOnceMedia {
  kind: 'image' | 'video' | string;
  bytes: Uint8Array;
}

/**
 * The opened media, full screen. The bytes are only held for as long as this is
 * open: the object URL is revoked as soon as it closes (or unmounts). There is no
 * way to save it from here, and it says honestly that screenshots can't be stopped.
 */
export function ViewOnceViewer({
  media,
  onClose,
}: {
  media: ViewOnceMedia | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!media) return;
    const u = URL.createObjectURL(new Blob([media.bytes as BlobPart]));
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [media]);

  useEffect(() => {
    if (!media) return;
    const previously = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        // One control: focus stays on Close.
        e.preventDefault();
        close.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previously?.focus?.();
    };
  }, [media, onClose]);

  if (!media) return null;
  const label = `View once ${what(media.kind)}`;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <NumberCircleOneIcon size={18} aria-hidden="true" />
          {label}
        </p>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-md border border-white/40 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <XIcon size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        {url &&
          (media.kind === 'video' ? (
            <video
              src={url}
              controls
              autoPlay
              playsInline
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              className="max-h-full max-w-full"
            />
          ) : (
            <img
              src={url}
              alt=""
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
            />
          ))}
      </div>
      <p className="shrink-0 px-4 py-4 text-center text-sm text-white/85">
        Opens once on this device. Screenshots can’t be blocked.
      </p>
    </div>,
    document.body,
  );
}
