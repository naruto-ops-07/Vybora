import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

// Skin in styles/primitives.css: the control edge, a faint inset, an accent edge and
// 2 px ring on focus (danger when invalid). The look's radius.
const fieldBase =
  'vy-field w-full rounded-md px-3 text-[15px] placeholder:text-subtle disabled:opacity-60';

interface FieldShellProps {
  label?: string;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
  counter?: { value: number; max: number };
}

function FieldShell({ label, hint, error, id, children, counter }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      {(label || counter) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label htmlFor={id} className="text-[13px] font-semibold text-ink">
              {label}
            </label>
          )}
          {counter && (
            <span
              className={cn(
                'font-mono text-[11px] tabular-nums',
                counter.value > counter.max ? 'text-danger' : 'text-subtle',
              )}
            >
              {counter.value}/{counter.max}
            </span>
          )}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, className, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={id}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(fieldBase, 'h-11', leading && 'pl-10', trailing && 'pr-11', className)}
          {...rest}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        )}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  max?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, max, className, id: idProp, value, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  const length = typeof value === 'string' ? value.length : 0;
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      id={id}
      counter={max ? { value: length, max } : undefined}
    >
      <textarea
        ref={ref}
        id={id}
        value={value}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(fieldBase, 'min-h-24 resize-y py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </FieldShell>
  );
});

/** Accessible switch. Square-cornered track to avoid pill-heavy controls. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-md border transition-colors duration-150 disabled:opacity-45',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-4 w-4 rounded-sm transition-[left,background-color] duration-150',
          checked ? 'left-[19px] bg-on-accent' : 'left-[3px] bg-muted',
        )}
      />
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}
