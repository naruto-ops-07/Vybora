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
      // An inset track with a raised accent thumb (styles/primitives.css).
      className="vy-seg grid gap-[3px] rounded-md p-[3px]"
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
            'vy-seg-item touch-target flex min-h-[34px] min-w-0 items-center justify-center rounded-[calc(var(--vy-radius-md)-4px)] px-2 py-1 text-center text-sm leading-tight font-medium disabled:opacity-45',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
