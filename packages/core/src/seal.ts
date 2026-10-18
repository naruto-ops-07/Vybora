/**
 * "Sealed send": after a message goes out, the paper plane gives way to a lock
 * whose shackle closes, then the plane comes back. One timeline, shared by web
 * (`seal-*` keyframes in apps/web/src/styles/index.css, which its tests check
 * against this) and mobile (Reanimated, sampled from `sealFrame`):
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
