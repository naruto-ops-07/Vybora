import { searchMessages, type SearchHit } from '@vybora/core';
import type { ConnectEngine, LocalMessage } from '@vybora/e2ee';
import { useEffect, useRef, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from './useChatSearch';

/**
 * Search every chat's local messages, for the inbox. The query is matched on
 * this device against the decrypted store; nothing about it is ever sent.
 */
export function useMessageSearch(
  engine: ConnectEngine | null,
  term: string,
  nameOf: (conversationId: string, userId: string) => string,
  limit = 20,
): { hits: SearchHit<LocalMessage>[]; searching: boolean } {
  const [hits, setHits] = useState<SearchHit<LocalMessage>[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const run = useRef(0);
  const name = useRef(nameOf);
  name.current = nameOf;

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed || !engine) {
      setQuery('');
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => setQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term, engine]);

  useEffect(() => {
    if (!query || !engine) return;
    const mine = ++run.current;
    void (async () => {
      const messages = await engine.queryMessages({}).catch(() => []);
      if (run.current !== mine) return;
      setHits(
        searchMessages(messages, query, {
          nameOf: () => '',
          limit,
        }).map((h) => h),
      );
      setSearching(false);
    })();
  }, [query, engine, limit]);

  return { hits, searching };
}

/** Chats where an unread message mentions me (the inbox's `@` marker). */
export function useMentionedChats(
  engine: ConnectEngine | null,
  myUserId: string,
  lastReadSeqOf: Record<string, number>,
): Set<string> {
  const [mentions, setMentions] = useState<{ conversationId: string; seq: number }[]>([]);
  // The engine emits a change on every new message, which refreshes this.
  useEffect(() => {
    if (!engine) {
      setMentions([]);
      return;
    }
    let live = true;
    const load = () =>
      void engine
        .queryMessages({
          filter: (m) => !m.deleted && !!m.mentions?.includes(myUserId) && m.seq !== null,
          limit: 50,
        })
        .then((found) => {
          if (live)
            setMentions(found.map((m) => ({ conversationId: m.conversationId, seq: m.seq ?? 0 })));
        })
        .catch(() => undefined);
    load();
    const stop = engine.onChange(() => load());
    return () => {
      live = false;
      stop();
    };
  }, [engine, myUserId]);

  return new Set(
    mentions
      .filter((m) => m.seq > (lastReadSeqOf[m.conversationId] ?? Number.MAX_SAFE_INTEGER))
      .map((m) => m.conversationId),
  );
}
