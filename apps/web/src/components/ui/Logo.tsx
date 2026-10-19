import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * VYBORA mark: a "V" drawn as two strokes meeting at a sealed point — a message that
 * only reaches its recipient. Drawn in the look's primary colours: the tile is the
 * primary gradient (one colour under high contrast), the V and the seal its ink.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = `vy-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--vy-primary-from)" />
          <stop offset="1" stopColor="var(--vy-primary-to)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id})`} />
      <path
        d="M18 20 L32 45 L46 20"
        fill="none"
        stroke="var(--vy-on-primary)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="29" y="14" width="6" height="6" rx="1" fill="var(--vy-on-primary)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 26 : 30} />
      <span className="text-[17px] font-bold tracking-[0.14em]">VYBORA</span>
    </span>
  );
}
