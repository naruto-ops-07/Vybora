import { cn } from '@/lib/cn';

export function Spinner({
  size = 20,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span role={label ? 'status' : undefined} className={cn('inline-flex', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="animate-spin"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full flex-1 items-center justify-center text-accent">
      <Spinner size={24} label={label} />
    </div>
  );
}
