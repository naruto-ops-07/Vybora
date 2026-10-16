import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * A row of mutually exclusive options (ARIA radio group). Only the checked
 * radio is tabbable; arrow keys move and select. A value that matches no
 * option (e.g. a legacy setting) leaves every radio unchecked.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[e.key];
    if (!step || disabled) return;
    e.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next]!.value);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className="grid overflow-hidden rounded-md border border-line-strong"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={i === at ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'touch-target flex h-10 items-center justify-center px-2 text-sm font-medium transition-colors duration-150 disabled:opacity-45',
            i > 0 && 'border-l border-line-strong',
            value === o.value ? 'bg-accent text-on-accent' : 'hover:bg-surface-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
