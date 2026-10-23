import { PushPinIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface PinnedItem {
  messageId: string;
  /** One line about the message (`messageSummary`), local only. */
  summary: string;
}

/**
 * Under the chat header: the newest pin first. Activating it shows that message
 * in the thread and moves on to the next older pin, round to the newest again.
 * The stacked marks on the start edge say how many pins there are and which
 * one is showing (top is the newest).
 */
export function PinBar({
  pins,
  onShow,
  accent,
}: {
  /** Oldest first, as the engine lists them (at most 3). */
  pins: readonly PinnedItem[];
  onShow: (messageId: string) => void;
  accent: string;
}) {
  const newestFirst = [...pins].reverse();
  const key = newestFirst.map((p) => p.messageId).join(',');
  const [at, setAt] = useState(0);
  // A new pin (or an unpin) starts again from the newest.
  useEffect(() => setAt(0), [key]);
  if (!newestFirst.length) return null;
  const i = Math.min(at, newestFirst.length - 1);
  const shown = newestFirst[i]!;
  const n = newestFirst.length;

  return (
    <button
      type="button"
      onClick={() => {
        onShow(shown.messageId);
        setAt((i + 1) % n);
      }}
      aria-label={`Pinned message${n > 1 ? ` ${i + 1} of ${n}` : ''}: ${shown.summary}. Show in chat`}
      className="vy-panel vy-canvas-layer flex min-h-11 w-full shrink-0 items-center gap-3 border-b px-4 py-1.5 text-left transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--vy-text)_4%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-6"
      data-pin-bar=""
    >
      <span className="flex h-7 w-[3px] shrink-0 flex-col gap-[3px]" aria-hidden="true">
        {newestFirst.map((p, k) => (
          <span
            key={p.messageId}
            className={cn('min-h-0 flex-1 rounded-full', k !== i && 'bg-line-strong')}
            style={k === i ? { background: accent } : undefined}
            data-pin-mark={k === i ? 'current' : ''}
          />
        ))}
      </span>
      <PushPinIcon size={15} weight="fill" className="shrink-0 text-muted" aria-hidden="true" />
      <span className="text-msg-sm min-w-0 flex-1 truncate">{shown.summary}</span>
      {n > 1 && (
        <span className="shrink-0 font-mono text-[11px] text-subtle" aria-hidden="true">
          {i + 1}/{n}
        </span>
      )}
    </button>
  );
}
