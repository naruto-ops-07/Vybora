import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => {
  const attr =
    typeof document !== 'undefined' ? document.documentElement.dataset.reduceMotion : undefined;
  if (attr) return attr === 'true';
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
};

/** Smooth scrolling for the marketing page only; off with reduced motion. */
export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: true, anchors: { offset: -88 } });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [enabled]);
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Settles text into `target` with a brief left-to-right scramble, so a change
 * in ciphertext reads as "re-sealed". Instant with reduced motion.
 */
export function useScramble(target: string, duration = 420) {
  const [shown, setShown] = useState(target);
  const frame = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || !target) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const settled = Math.floor(target.length * p);
      let out = target.slice(0, settled);
      for (let i = settled; i < target.length; i++)
        out += target[i] === '=' ? '=' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setShown(out);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return shown;
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
