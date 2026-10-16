export const SWIPE_REPLY_THRESHOLD = 64;
const FLICK_VELOCITY = 800;
const FLICK_MIN_DX = 24;

export type SwipeState = 'idle' | 'armed' | 'trigger';

/** Shared swipe-to-reply rule for web (touch) and mobile. */
export function swipeReplyDecision(g: {
  dx: number;
  dy: number;
  vx: number;
  released: boolean;
}): SwipeState {
  if (g.dx <= 0 || Math.abs(g.dy) > Math.abs(g.dx)) return 'idle';
  if (!g.released) return g.dx >= SWIPE_REPLY_THRESHOLD ? 'armed' : 'idle';
  if (g.dx >= SWIPE_REPLY_THRESHOLD) return 'trigger';
  return g.vx >= FLICK_VELOCITY && g.dx >= FLICK_MIN_DX ? 'trigger' : 'idle';
}
