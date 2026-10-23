import type { ReplyDraft } from './Composer';

/**
 * What a chat should do when it next opens: jump to a message (starred
 * messages) or start a reply quoting another chat's message (reply privately).
 * In memory only: never in the URL, history state or storage, because a reply
 * quote is message text.
 */
export interface ThreadIntent {
  jumpTo?: string;
  reply?: ReplyDraft;
}

const intents = new Map<string, ThreadIntent>();
const listeners = new Set<() => void>();

export function setThreadIntent(conversationId: string, intent: ThreadIntent) {
  intents.set(conversationId, intent);
  listeners.forEach((l) => l());
}

/** Read and clear the intent for a chat (null when there's none). */
export function takeThreadIntent(conversationId: string): ThreadIntent | null {
  const i = intents.get(conversationId) ?? null;
  intents.delete(conversationId);
  return i;
}

export function subscribeThreadIntents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
