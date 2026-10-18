import { PaperPlaneRightIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SEAL_MS, sealFrame } from '@vybora/core';
import { cn } from '@/lib/cn';

export { SEAL_MS, SHACKLE_LIFT_PX, sealFrame } from '@vybora/core';

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
