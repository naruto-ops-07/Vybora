import { XIcon } from '@phosphor-icons/react';
import { forwardRef, useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideTitle?: boolean;
}

/** Accessible modal: focus trap, Escape to close, focus restore, scroll lock. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideTitle,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose, read at the moment of closing: a parent re-render (a new
  // arrow function) must not re-run the open effect and pull focus back to the start.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const first =
        panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.current)?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null,
        );
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <DialogSurface
        ref={panel}
        titleId={titleId}
        descId={descId}
        title={title}
        description={description}
        footer={footer}
        size={size}
        hideTitle={hideTitle}
        onClose={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {children}
      </DialogSurface>
    </div>,
    document.body,
  );
}

export interface DialogSurfaceProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, 'title'>,
    Pick<DialogProps, 'title' | 'description' | 'footer' | 'size' | 'hideTitle' | 'onClose'> {
  titleId?: string;
  descId?: string;
}

/**
 * The dialog panel itself: a raised popover at elevation 3 (glass where the look has
 * it), the title in the look's display face. `Dialog` wraps it in the modal layer;
 * the design gallery shows it in place.
 */
export const DialogSurface = forwardRef<HTMLDivElement, DialogSurfaceProps>(function DialogSurface(
  {
    titleId,
    descId,
    title,
    description,
    footer,
    size = 'md',
    hideTitle,
    onClose,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'vy-popover vy-popover-3 relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg outline-none sm:rounded-lg',
        { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' }[size],
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-4 border-b border-line px-5 pb-3.5 pt-4',
          hideTitle && 'sr-only',
        )}
      >
        <div className="min-w-0">
          <h2 id={titleId} className="type-wide text-lg tracking-[-0.01em]">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close"
          className="touch-target -mr-1.5 text-muted"
        >
          <XIcon size={18} />
        </Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t border-line bg-surface-muted/40 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
});

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
