import { CheckIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { foldText } from '@vybora/core';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

export interface ForwardTarget {
  id: string;
  title: string;
  avatar: ReactNode;
}

const forwardLabel = (n: number) =>
  n === 0 ? 'Forward' : n === 1 ? 'Forward to 1 chat' : `Forward to ${n} chats`;

/** Pick one or more chats to forward a message to (it is re-encrypted for each). */
export function ForwardDialog({
  open,
  chats,
  onClose,
  onForward,
}: {
  open: boolean;
  chats: readonly ForwardTarget[];
  onClose: () => void;
  /** Resolves when every forward has been tried. */
  onForward: (conversationIds: string[]) => Promise<void> | void;
}) {
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setTerm('');
      setPicked(new Set());
      setBusy(false);
    }
  }, [open]);

  const shown = useMemo(() => {
    const q = foldText(term.trim());
    return q ? chats.filter((c) => foldText(c.title).includes(q)) : chats;
  }, [chats, term]);
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = async () => {
    const ids = chats.filter((c) => picked.has(c.id)).map((c) => c.id);
    if (!ids.length) return;
    setBusy(true);
    try {
      await onForward(ids);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Forward to"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!picked.size} loading={busy}>
            {forwardLabel(picked.size)}
          </Button>
        </>
      }
    >
      <label className="vy-search flex h-10 items-center gap-2 rounded-md px-3">
        <MagnifyingGlassIcon size={16} className="text-subtle" aria-hidden="true" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          data-autofocus
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </label>
      {shown.length ? (
        <ul className="-mx-2 mt-3 space-y-0.5" aria-label="Chats">
          {shown.map((c) => {
            const on = picked.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={c.title}
                  onClick={() => toggle(c.id)}
                  className="vy-row flex min-h-12 w-full items-center gap-3 px-2 py-1.5 text-left"
                  data-active={on}
                >
                  {c.avatar}
                  <span className="min-w-0 flex-1 truncate text-[15px]">{c.title}</span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                      on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                    )}
                    aria-hidden="true"
                  >
                    {on && <CheckIcon size={12} weight="bold" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted">No chats match</p>
      )}
    </Dialog>
  );
}
