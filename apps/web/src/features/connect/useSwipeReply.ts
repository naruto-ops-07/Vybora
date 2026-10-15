import { SWIPE_REPLY_THRESHOLD, swipeReplyDecision } from '@vybora/core';
import { useRef, useState, type HTMLAttributes, type PointerEvent } from 'react';

const MAX_OFFSET = 96;

/** Touch-only swipe-to-reply; mouse users keep the hover buttons and the menu. */
export function useSwipeReply(onTrigger: () => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [offset, setOffset] = useState(0);

  const end = (e: PointerEvent<HTMLElement>, released: boolean) => {
    const s = start.current;
    start.current = null;
    setOffset(0);
    if (!s || !released) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const vx = (dx / Math.max(1, e.timeStamp - s.t)) * 1000;
    if (swipeReplyDecision({ dx, dy, vx, released: true }) === 'trigger') onTrigger();
  };

  const handlers: Pick<
    HTMLAttributes<HTMLElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > = enabled
    ? {
        onPointerDown: (e) => {
          if (e.pointerType !== 'touch') return;
          start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        },
        onPointerMove: (e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
            start.current = null;
            setOffset(0);
            return;
          }
          setOffset(Math.max(0, Math.min(dx, MAX_OFFSET)));
        },
        onPointerUp: (e) => end(e, true),
        onPointerCancel: (e) => end(e, false),
      }
    : {};

  return { handlers, offset, armed: offset >= SWIPE_REPLY_THRESHOLD };
}
