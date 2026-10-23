import { NumberOneIcon, XIcon } from '@phosphor-icons/react';
import { detectMime } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';
import { useMessageKinds } from './context';

const what = (kind: string) => (kind === 'video' ? 'video' : 'photo');

/**
 * A view-once photo or video in the thread: always "Photo"/"Video" over "View
 * once". A received one that was opened says "Opened" instead; my own copy never
 * does (I can't know whether it was opened). Never download, forward or copy.
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
  const open = !mine && !vo.consumed;
  const opened = !mine && vo.consumed;
  const [opening, setOpening] = useState(false);
  const tap = async () => {
    if (selecting || opening) return;
    setOpening(true);
    try {
      await kinds.onOpenViewOnce(m);
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="flex w-[16.5rem] max-w-full items-center gap-3 py-0.5" data-view-once="">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px]',
          opened && 'border-dashed',
          open
            ? filled
              ? 'border-current'
              : 'border-accent text-accent'
            : filled
              ? 'border-current'
              : 'border-line-strong text-muted',
        )}
        aria-hidden="true"
        data-once-ring=""
      >
        <NumberOneIcon size={18} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {vo.kind === 'video' ? 'Video' : 'Photo'}
        </span>
        <span className={cn('block whitespace-nowrap text-xs', !filled && 'text-muted')}>
          {opened ? 'Opened' : 'View once'}
        </span>
      </span>
      {open && (
        <button
          type="button"
          onClick={() => void tap()}
          aria-busy={opening || undefined}
          className={cn(
            'touch-target min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150',
            opening && 'cursor-wait',
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
  /** The message it came from: focus goes back there when the viewer closes. */
  messageId?: string;
}

const FOCUSABLE = 'button:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])';

/**
 * The opened media, full screen. Only bytes that really are an image or a video
 * (by their signature, never SVG) are shown, typed as such. The object URL is
 * revoked as soon as it closes. There is no way to save it from here, and it says
 * honestly that screenshots can't be stopped.
 */
export function ViewOnceViewer({
  media,
  onClose,
}: {
  media: ViewOnceMedia | null;
  onClose: () => void;
}) {
  const { reduceMotion } = useA11y();
  const [url, setUrl] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // The latest onClose, without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const type = useMemo(() => {
    if (!media) return null;
    const mime = detectMime(media.bytes);
    const want = media.kind === 'video' ? 'video/' : 'image/';
    return mime?.startsWith(want) ? mime : null;
  }, [media]);

  useEffect(() => {
    if (!media || !type) return;
    const u = URL.createObjectURL(new Blob([media.bytes as BlobPart], { type }));
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [media, type]);

  const open = !!media;
  const returnTo = media?.messageId;
  useEffect(() => {
    if (!open) return;
    const previously = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        items[next]!.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // "Tap to view" is gone by now: go back to the message itself.
      const message = returnTo
        ? document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(returnTo)}"]`)
        : null;
      (message ?? previously)?.focus?.();
    };
  }, [open, returnTo]);

  if (!media) return null;
  const label = `View once ${what(media.kind)}`;
  return createPortal(
    <div
      ref={panel}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <NumberOneIcon size={16} weight="bold" aria-hidden="true" />
          {label}
        </p>
        <button
          ref={close}
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-md border border-white/40 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <XIcon size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        {!type ? (
          <p className="text-sm text-white/85">
            This {what(media.kind)} can’t be shown on this browser.
          </p>
        ) : (
          url &&
          (media.kind === 'video' ? (
            <video
              src={url}
              controls
              // Focusable everywhere, so Tab can reach its controls inside the trap.
              tabIndex={0}
              autoPlay={!reduceMotion}
              playsInline
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              className="max-h-full max-w-full focus-visible:outline-2 focus-visible:outline-white"
            />
          ) : (
            <img
              src={url}
              alt=""
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
            />
          ))
        )}
      </div>
      <p className="shrink-0 px-4 py-4 text-center text-sm text-white/85">
        Opens once on this device. Screenshots can’t be blocked.
      </p>
    </div>,
    document.body,
  );
}
