import { CheckCircleIcon, InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<{
  show: (message: string, tone?: Tone, action?: ToastItem['action']) => void;
} | null>(null);

const icon = {
  success: <CheckCircleIcon size={18} className="shrink-0 text-success" aria-hidden="true" />,
  error: <WarningIcon size={18} className="shrink-0 text-danger" aria-hidden="true" />,
  info: <InfoIcon size={18} className="shrink-0 text-accent" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: Tone = 'info', action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), action ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        // Top of the viewport so toasts never cover the composer or bottom navigation.
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <ToastCard
            key={t.id}
            tone={t.tone}
            message={t.message}
            action={t.action}
            className="pointer-events-auto"
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** One toast: the popover surface at elevation 2, a tone icon, the message, an action. */
export function ToastCard({
  tone,
  message,
  action,
  className,
}: {
  tone: Tone;
  message: string;
  action?: ToastItem['action'];
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'vy-popover flex min-h-12 max-w-md items-center gap-3 rounded-md py-2 pl-4 pr-2 text-sm font-medium',
        !action && 'pr-4',
        className,
      )}
    >
      {icon[tone]}
      <span className="min-w-0 flex-1 py-1">{message}</span>
      {action && (
        <button
          type="button"
          className="touch-target -my-1 shrink-0 rounded-sm px-2.5 py-1.5 font-semibold text-accent transition-colors duration-150 hover:bg-accent-soft"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
