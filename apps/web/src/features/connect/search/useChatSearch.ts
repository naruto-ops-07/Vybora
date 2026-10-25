import { searchMessages, type SearchHit } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Typing settles before anything is searched (every keystroke would scan the store). */
export const SEARCH_DEBOUNCE_MS = 150;

export interface ChatSearch {
  bar: {
    open: boolean;
    term: string;
    onTerm: (term: string) => void;
    onClose: () => void;
    onStep: (delta: 1 | -1) => void;
    count: number;
    index: number;
    searching: boolean;
  };
  /** The message id of the current hit, for highlighting it. */
  current: string | null;
  /** The query the current hit matched, for marking it in the bubble. */
  term: string;
  open: () => void;
  isOpen: boolean;
}

/**
 * Search inside one chat, over the local decrypted store only: the query never
 * leaves the device. Results are newest first; stepping scrolls to each one.
 */
export function useChatSearch({
  load,
  nameOf,
  onJump,
  contactName,
}: {
  load: () => Promise<LocalMessage[]>;
  nameOf: (userId: string) => string;
  onJump: (messageId: string) => void;
  contactName?: (userId: string) => string | undefined;
}): ChatSearch {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit<LocalMessage>[]>([]);
  const [index, setIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const run = useRef(0);
  // The chat re-renders constantly: keep the callers in refs so only a new query searches.
  const latest = useRef({ load, nameOf, contactName });
  latest.current = { load, nameOf, contactName };

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setQuery('');
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => setQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!query) return;
    const mine = ++run.current;
    void (async () => {
      const { load: get, nameOf: name, contactName: contact } = latest.current;
      const messages = await get().catch(() => []);
      if (run.current !== mine) return;
      setHits(searchMessages(messages, query, { nameOf: name, contactName: contact }));
      setIndex(0);
      setSearching(false);
    })();
  }, [query]);

  // Showing a hit scrolls to it; a new search starts at the newest.
  const currentId = hits[index]?.message.id ?? null;
  useEffect(() => {
    if (currentId) onJump(currentId);
    // Only a change of hit scrolls, not every render of the chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const close = useCallback(() => {
    setOpen(false);
    setTerm('');
    setQuery('');
    setHits([]);
  }, []);

  const start = useCallback(() => setOpen(true), []);
  const step = useCallback(
    (delta: 1 | -1) => setIndex((i) => (hits.length ? (i + delta + hits.length) % hits.length : 0)),
    [hits.length],
  );

  return useMemo(
    () => ({
      bar: {
        open,
        term,
        onTerm: setTerm,
        onClose: close,
        onStep: step,
        count: hits.length,
        index,
        searching,
      },
      current: currentId,
      term: query,
      open: start,
      isOpen: open,
    }),
    [open, term, close, step, start, hits.length, index, searching, currentId, query],
  );
}
