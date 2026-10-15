import { CheckCircleIcon, InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

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
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-md border border-line-strong bg-surface px-4 py-3 text-sm font-medium"
          >
            {icon[t.tone]}
            <span>{t.message}</span>
            {t.action && (
              <button className="ml-2 font-semibold text-accent" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
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
