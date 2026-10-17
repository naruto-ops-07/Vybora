import { PaperPlaneRightIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * "Sealed send": after a message goes out, the paper plane gives way to a lock
 * whose shackle closes, then the plane comes back. One timeline, mirrored by
 * the `seal-*` keyframes in styles/index.css (keep the two in step):
 *
 *   0–60 ms     plane fades out
 *   0–80 ms     lock body fades in, its shackle still open 3 px
 *   40–180 ms   shackle drops and closes (exponential ease-out, like the fades)
 *   180–240 ms  the closed lock holds
 *   240–320 ms  lock fades out by 290 ms; plane fades back in from 260 ms
 *
 * 320 ms in all, return included. Opacity and transform only, inside the
 * button's fixed 18 px glyph box, so nothing moves around it. Purely visual:
 * the button keeps its name, nothing is announced, and reduced motion turns it
 * off completely.
 */
export const SEAL_MS = {
  planeOut: 60,
  lockIn: 80,
  shackleFrom: 40,
  close: 180,
  hold: 60,
  lockOut: 50,
  planeFrom: 260,
  total: 320,
} as const;
/** How far the open shackle sits above its closed position. */
export const SHACKLE_LIFT_PX = 3;

/** A CSS `cubic-bezier()` timing function, sampled at progress `t` (0–1). */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (s: number, a: number, b: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < t) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
}
/** Exponential ease-out, as the keyframes write it. */
const expoOut = bezier(0.16, 1, 0.3, 1);
const easeIn = bezier(0.42, 0, 1, 1);
const progress = (ms: number, from: number, length: number) =>
  Math.min(1, Math.max(0, (ms - from) / length));

/** The keyframes sampled at `ms`: for the gallery's still frames (and tests). */
export function sealFrame(ms: number): { plane: number; lock: number; shackleY: number } {
  const t = SEAL_MS;
  const turn = t.close + t.hold; // 240 ms: the closed lock gives way
  return {
    plane:
      ms < t.planeFrom
        ? 1 - expoOut(progress(ms, 0, t.planeOut))
        : expoOut(progress(ms, t.planeFrom, t.total - t.planeFrom)),
    lock:
      ms < turn ? expoOut(progress(ms, 0, t.lockIn)) : 1 - easeIn(progress(ms, turn, t.lockOut)),
    shackleY:
      -SHACKLE_LIFT_PX * (1 - expoOut(progress(ms, t.shackleFrom, t.close - t.shackleFrom))),
  };
}

/**
 * Drives the seal: `play()` starts (or restarts) one run; it ends by itself.
 * Off under reduced motion. `run` changes on every play so the glyphs remount
 * and their CSS animations start from the top.
 */
export function useSealedSend(reduceMotion: boolean) {
  const [state, setState] = useState({ run: 0, playing: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const play = useCallback(() => {
    if (reduceMotion) return;
    clearTimeout(timer.current);
    setState((s) => ({ run: s.run + 1, playing: true }));
    timer.current = setTimeout(() => setState((s) => ({ ...s, playing: false })), SEAL_MS.total);
  }, [reduceMotion]);

  // Turning reduced motion on mid-run stops it at once.
  useEffect(() => {
    if (!reduceMotion) return;
    clearTimeout(timer.current);
    setState((s) => (s.playing ? { ...s, playing: false } : s));
  }, [reduceMotion]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { ...state, play };
}

/** A padlock drawn in px (18-unit box), so the shackle's lift reads as real pixels. */
function Lock({ style, shackleStyle }: { style?: CSSProperties; shackleStyle?: CSSProperties }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      overflow="visible"
      className="seal-lock absolute inset-0"
      style={style}
      aria-hidden="true"
      focusable="false"
      data-seal-lock=""
    >
      <path
        className="seal-shackle"
        style={shackleStyle}
        d="M5.9 8V5.4a3.1 3.1 0 0 1 6.2 0V8"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <rect x={2.75} y={7.75} width={12.5} height={8.5} rx={2} fill="currentColor" />
    </svg>
  );
}

/**
 * The send button's glyph. Live: `run`/`playing` from `useSealedSend`.
 * Gallery only: `frameAt` (ms) draws a still frame of the timeline instead.
 */
export function SendGlyph({
  run = 0,
  playing = false,
  frameAt,
}: {
  run?: number;
  playing?: boolean;
  frameAt?: number;
}) {
  const still = frameAt === undefined ? null : sealFrame(frameAt);
  const showLock = still ? still.lock > 0 : playing;
  return (
    <span
      className="relative block h-[18px] w-[18px]"
      aria-hidden="true"
      data-seal={still ? 'frame' : playing ? 'playing' : 'idle'}
    >
      <PaperPlaneRightIcon
        key={`plane-${run}`}
        size={18}
        weight="fill"
        className={cn('absolute inset-0', playing && !still && 'seal-plane')}
        style={still ? { opacity: still.plane } : undefined}
      />
      {showLock && (
        <Lock
          key={`lock-${run}`}
          style={still ? { opacity: still.lock, animation: 'none' } : undefined}
          shackleStyle={
            still ? { transform: `translateY(${still.shackleY}px)`, animation: 'none' } : undefined
          }
        />
      )}
    </span>
  );
}
