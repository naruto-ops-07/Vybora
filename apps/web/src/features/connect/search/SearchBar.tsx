import { CaretDownIcon, CaretUpIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Find a message in this chat: under the header, with the hit count and a step
 * through the results. Enter goes older, Shift+Enter newer, Escape closes.
 */
export function SearchBar({
  open,
  term,
  onTerm,
  onClose,
  onStep,
  count,
  index,
  searching,
}: {
  open: boolean;
  term: string;
  onTerm: (term: string) => void;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  count: number;
  index: number;
  searching: boolean;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  if (!open) return null;
  const asked = term.trim().length > 0;
  return (
    <div
      className="vy-panel vy-canvas-layer flex shrink-0 flex-col gap-1 border-b px-3 py-2 md:px-6"
      data-chat-search=""
    >
      <div className="flex items-center gap-2">
        <label className="vy-search flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-3">
          <MagnifyingGlassIcon size={16} className="shrink-0 text-subtle" aria-hidden="true" />
          <input
            ref={box}
            type="search"
            value={term}
            onChange={(e) => onTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (count) onStep(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search this chat"
            aria-label="Search this chat"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          {searching && asked && <Spinner size={14} className="shrink-0 text-subtle" />}
        </label>
        <p className="w-20 shrink-0 text-center font-mono text-[11px] text-muted" role="status">
          {!asked ? '' : searching ? '' : count ? `${index + 1} of ${count}` : 'No matches'}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="touch-target text-muted"
          aria-label="Newer result"
          disabled={count < 2}
          onClick={() => onStep(-1)}
        >
          <CaretUpIcon size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="touch-target text-muted"
          aria-label="Older result"
          disabled={count < 2}
          onClick={() => onStep(1)}
        >
          <CaretDownIcon size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="touch-target text-muted"
          aria-label="Close search"
          onClick={onClose}
        >
          <XIcon size={18} />
        </Button>
      </div>
      <p className="text-[11px] text-subtle">Searches messages on this device.</p>
    </div>
  );
}
