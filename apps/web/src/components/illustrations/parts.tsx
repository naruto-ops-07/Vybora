/**
 * Shared drawing parts for the empty-state illustrations. One grammar:
 * graphite line (`currentColor`, the muted text colour) at 1.5 px with round
 * caps and joins; flat fills from the personal tones and the accent, via CSS
 * variables so every drawing follows light, dark and high contrast; corner
 * radii 8–12; no gradients, no shadows.
 *
 * Every stroke is 1.5 px on screen at any drawing size (non-scaling), whatever
 * its colour; "text" bars are flat fills, not strokes.
 */
import type { ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/cn';

/** The one stroke: 1.5 px, round, unscaled by the viewBox or a transform. */
export const STROKE = {
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const satisfies SVGProps<SVGPathElement>;

/** Graphite line work. */
export const LINE = {
  stroke: 'currentColor',
  ...STROKE,
} as const satisfies SVGProps<SVGPathElement>;

export const FILL = {
  accent: 'var(--vy-accent)',
  onAccent: 'var(--vy-on-accent)',
  surface: 'var(--vy-surface)',
  bubble: 'var(--vy-bubble-in)',
  text: 'var(--vy-border-strong)',
  tone: (name: string) => `var(--vy-tone-${name}-fill)`,
  toneInk: (name: string) => `var(--vy-tone-${name}-ink)`,
};

/**
 * A chat bubble with VYBORA's tail: the run-end corner tightens and a flat
 * notch curves out of it (the same curve as `Bubble`'s Tail, scaled 1.4×).
 */
export function bubblePath(
  x: number,
  y: number,
  w: number,
  h: number,
  tail: 'left' | 'right',
  r = 10,
): string {
  const x1 = x + w;
  const y1 = y + h;
  const t = 1.4;
  if (tail === 'right')
    return [
      `M${x + r} ${y}`,
      `H${x1 - r}`,
      `A${r} ${r} 0 0 1 ${x1} ${y + r}`,
      `V${y1 - 10 * t}`,
      `C${x1 + 0.5 * t} ${y1 - 4 * t} ${x1 + 3.5 * t} ${y1 - t} ${x1 + 8 * t} ${y1}`,
      `H${x + r}`,
      `A${r} ${r} 0 0 1 ${x} ${y1 - r}`,
      `V${y + r}`,
      `A${r} ${r} 0 0 1 ${x + r} ${y}`,
      'Z',
    ].join(' ');
  return [
    `M${x1 - r} ${y}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 0 ${x} ${y + r}`,
    `V${y1 - 10 * t}`,
    `C${x - 0.5 * t} ${y1 - 4 * t} ${x - 3.5 * t} ${y1 - t} ${x - 8 * t} ${y1}`,
    `H${x1 - r}`,
    `A${r} ${r} 0 0 0 ${x1} ${y1 - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 0 ${x1 - r} ${y}`,
    'Z',
  ].join(' ');
}

/** Height of a "text" bar (the old 3.5 stroke, now a fill). */
const BAR = 3.5;

/** Rounded "text" bars inside a bubble (flat fills): placeholders, never real words. */
export function TextLines({
  x,
  y,
  widths,
  color = FILL.text,
  gap = 11,
}: {
  x: number;
  y: number;
  widths: number[];
  color?: string;
  gap?: number;
}) {
  return (
    <g fill={color}>
      {widths.map((w, i) => (
        <rect
          key={i}
          x={x - BAR / 2}
          y={y + i * gap - BAR / 2}
          width={w + BAR}
          height={BAR}
          rx={BAR / 2}
        />
      ))}
    </g>
  );
}

/** The lock seal: an accent disc with a closed padlock, outlined like everything else. */
export function LockSeal({ cx, cy, r = 13 }: { cx: number; cy: number; r?: number }) {
  const s = r / 13;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={FILL.accent} {...LINE} />
      <g transform={`translate(${cx} ${cy}) scale(${s})`}>
        <path
          d="M-3.6 -1.2V-3.8A3.6 3.6 0 0 1 3.6 -3.8V-1.2"
          fill="none"
          stroke={FILL.onAccent}
          {...STROKE}
        />
        <rect x={-5.5} y={-1.6} width={11} height={8.4} rx={2} fill={FILL.onAccent} />
        <circle cx={0} cy={2.4} r={1.15} fill={FILL.accent} />
      </g>
    </g>
  );
}

export interface IllustrationProps {
  /** Rendered width in px; height follows the drawing. */
  width?: number;
  className?: string;
}

/** Decorative SVG frame: hidden from assistive tech, never focusable. */
export function Frame({
  viewBox,
  width,
  className,
  children,
  name,
}: {
  viewBox: string;
  width: number;
  className?: string;
  children: ReactNode;
  name: string;
}) {
  const [, , w, h] = viewBox.split(' ').map(Number);
  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={Math.round((width * h!) / w!)}
      aria-hidden="true"
      focusable="false"
      fill="none"
      className={cn('shrink-0 text-muted', className)}
      data-illustration={name}
    >
      {children}
    </svg>
  );
}
