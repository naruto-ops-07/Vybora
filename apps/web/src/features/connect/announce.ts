import { messageSummary, nextAnnouncement, type AnnounceMark } from '@vybora/core';
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
  const seen = useRef<AnnounceMark | null>(null);

  useEffect(() => {
    if (!ready) return;
    const changed = seen.current?.conv !== conversationId;
    const { mark, announce } = nextAnnouncement(seen.current, messages, conversationId, userId);
    seen.current = mark;
    if (changed) setText('');
    else if (announce && !muted)
      setText(`${nameOf(announce.senderId)}: ${messageSummary(announce)}`);
  }, [messages, ready, userId, muted, conversationId, nameOf]);

  return text;
}
