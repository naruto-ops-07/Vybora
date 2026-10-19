import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

// Skins live in styles/primitives.css (look tokens; flat under high contrast).
const variants: Record<Variant, string> = {
  primary: 'vy-btn-primary',
  secondary: 'vy-btn-secondary',
  outline: 'vy-btn-outline',
  ghost: 'vy-btn-ghost',
  danger: 'vy-btn-danger',
};

// Small sizes take the look's small radius (callers add touch-target where it is tight).
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-sm',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-md',
  icon: 'h-10 w-10 rounded-md',
  'icon-sm': 'h-8 w-8 rounded-sm',
};

const base =
  'vy-btn inline-flex shrink-0 select-none items-center whitespace-nowrap justify-center font-semibold';

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: { variant?: Variant; size?: Size; fullWidth?: boolean; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * One button for the whole product, in the look's shape and depth. Hover and press
 * change colour and shadow only; focus is the accent's 2 px outline, offset.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    leftIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({
        variant,
        size,
        fullWidth,
        className: cn('disabled:opacity-45', className),
      })}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : leftIcon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/** Navigation styled as a button: one focusable link, never a button inside a link. */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant, size, fullWidth, className, ...rest },
  ref,
) {
  return (
    <Link
      ref={ref}
      data-button=""
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    />
  );
});
