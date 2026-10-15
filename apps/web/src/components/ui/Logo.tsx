import { cn } from '@/lib/cn';

/**
 * VYBORA mark: a "V" drawn as two strokes meeting at a sealed point — a
 * message that only reaches its recipient. Flat, two colours.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="#0F4C47" />
      <path
        d="M18 20 L32 45 L46 20"
        fill="none"
        stroke="#2DD4BF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="29" y="14" width="6" height="6" fill="#E6EEEE" />
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
