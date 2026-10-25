import { formatRowTime, searchSnippet } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { Skeleton } from '@/components/ui/States';

export interface MessageHit {
  message: LocalMessage;
  /** The chat it is in, and who sent it. */
  chat: string;
  sender: string;
  text: string;
  ranges: [number, number][];
}

/** Text with the matched ranges marked. */
export function Marked({ text, ranges }: { text: string; ranges: readonly [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const out = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) out.push(<span key={`t${at}`}>{text.slice(at, a)}</span>);
    out.push(
      <mark key={`m${a}`} className="vy-mark rounded-[3px]">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  if (at < text.length) out.push(<span key={`t${at}`}>{text.slice(at)}</span>);
  return <>{out}</>;
}

/**
 * Messages matching the inbox search, under the chats. Local only: it searches
 * the decrypted store on this device, so nothing about the query is sent anywhere.
 */
export function MessageResults({
  hits,
  loading,
  term,
  onOpen,
}: {
  hits: readonly MessageHit[];
  loading: boolean;
  term: string;
  onOpen: (m: LocalMessage) => void;
}) {
  if (!term.trim()) return null;
  const now = new Date();
  return (
    <section aria-label="Messages" className="px-2 pb-3">
      <h3 className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">Messages</h3>
      {loading ? (
        <div className="space-y-2 px-2" role="status" aria-label="Searching messages">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : hits.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">No messages match “{term.trim()}”</p>
      ) : (
        <ul aria-label="Messages" className="space-y-0.5">
          {hits.map((h) => {
            const snippet = searchSnippet(h);
            return (
              <li key={`${h.message.conversationId}/${h.message.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(h.message)}
                  className="vy-row flex w-full flex-col items-stretch gap-0.5 px-2 py-2.5 text-left"
                >
                  <span className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {h.chat ? `${h.sender} in ${h.chat}` : h.sender}
                    </span>
                    <time
                      className="shrink-0 font-mono text-[11px] text-subtle"
                      dateTime={h.message.createdAt}
                    >
                      {formatRowTime(h.message.createdAt, now)}
                    </time>
                  </span>
                  <span className="text-msg-sm line-clamp-2 break-anywhere text-muted">
                    <Marked text={snippet.text} ranges={snippet.ranges} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
