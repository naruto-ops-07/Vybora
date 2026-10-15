import { messageSummary } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { useEffect, useRef, useState } from 'react';

/**
 * Text for a polite live region: the newest incoming message that arrived
 * while this chat was open. Silent on first load, for muted chats and for
 * my own messages.
 */
export function useIncomingAnnouncement(
  messages: readonly LocalMessage[],
  opts: {
    ready: boolean;
    userId: string;
    muted: boolean;
    conversationId: string;
    nameOf: (id: string) => string;
  },
): string {
  const { ready, userId, muted, conversationId, nameOf } = opts;
  const [text, setText] = useState('');
  const seen = useRef<{ conv: string; id: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const newest = [...messages].reverse().find((m) => m.senderId !== userId);
    if (seen.current?.conv !== conversationId) {
      seen.current = { conv: conversationId, id: newest?.id ?? '' };
      setText('');
      return;
    }
    if (!newest || newest.id === seen.current.id) return;
    seen.current = { conv: conversationId, id: newest.id };
    if (!muted) setText(`${nameOf(newest.senderId)}: ${messageSummary(newest)}`);
  }, [messages, ready, userId, muted, conversationId, nameOf]);

  return text;
}
