/** Highest incoming `seq` already accounted for in a chat. */
export interface AnnounceMark {
  conv: string;
  seq: number;
}

/**
 * Decides which incoming message (if any) a screen reader should announce.
 * Silent on first load of a chat and for my own messages. It tracks the highest
 * announced `seq` rather than the newest id, so when the newest incoming message
 * expires or is deleted, older messages are not announced again.
 */
export function nextAnnouncement<T extends { seq: number | null; senderId: string }>(
  mark: AnnounceMark | null,
  messages: readonly T[],
  conversationId: string,
  userId: string,
): { mark: AnnounceMark; announce: T | null } {
  let newest: T | null = null;
  for (const m of messages) {
    if (m.senderId === userId || m.seq === null) continue;
    if (!newest || m.seq > (newest.seq ?? 0)) newest = m;
  }
  const top = newest?.seq ?? 0;
  if (!mark || mark.conv !== conversationId)
    return { mark: { conv: conversationId, seq: top }, announce: null };
  if (!newest || top <= mark.seq) return { mark, announce: null };
  return { mark: { conv: conversationId, seq: top }, announce: newest };
}
