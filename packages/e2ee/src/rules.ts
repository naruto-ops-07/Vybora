/**
 * Rules every client enforces on receive (and the sender checks before
 * sending). Kept in sync with the matching helpers in @vybora/core.
 */

/** A message may be edited by its sender for this long after it was sent. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Pins kept per chat; pinning a 4th drops the oldest. */
export const MAX_PINS = 3;

export interface PinEntry {
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
}

export function withinEditWindow(originalCreatedAt: string, editAt: string): boolean {
  const start = Date.parse(originalCreatedAt);
  const at = Date.parse(editAt);
  if (!Number.isFinite(start) || !Number.isFinite(at)) return false;
  return at - start <= EDIT_WINDOW_MS && at >= start - 60_000; // tolerate small clock skew
}

/** Add or remove a pin; re-pinning moves it to the newest spot; oldest dropped past the limit. */
export function applyPin(
  pins: readonly PinEntry[],
  change: { messageId: string; pinned: boolean; by: string; at: string },
  max = MAX_PINS,
): PinEntry[] {
  const rest = pins.filter((p) => p.messageId !== change.messageId);
  if (!change.pinned) return rest;
  const next = [...rest, { messageId: change.messageId, pinnedBy: change.by, pinnedAt: change.at }];
  return next.slice(Math.max(0, next.length - max));
}

/** Whether `actorId` may pin in this chat (direct: anyone; group: follows the admins-only setting). */
export function mayPin(
  info: { kind: 'direct' | 'group'; settingsPolicy?: 'everyone' | 'admins'; adminIds?: string[] },
  actorId: string,
): boolean {
  if (info.kind === 'direct' || info.settingsPolicy !== 'admins') return true;
  return (info.adminIds ?? []).includes(actorId);
}

/** Normalize a vote against its poll: in range, de-duplicated, sorted; null when invalid. */
export function normalizeVote(
  poll: { options: readonly string[]; multi: boolean },
  choices: readonly number[],
): number[] | null {
  const set = [...new Set(choices)].sort((a, b) => a - b);
  if (set.some((c) => !Number.isInteger(c) || c < 0 || c >= poll.options.length)) return null;
  if (!poll.multi && set.length > 1) return null;
  return set;
}

const MENTION = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/** User ids written as `@[userId]` tokens in a body, in order, de-duplicated. */
export function mentionTokens(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION)) {
    const id = m[1]!.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Keep only mentions that are both tokens in the body and current members.
 * Returns undefined when nothing valid remains.
 */
export function validMentions(
  body: string,
  claimed: readonly string[] | undefined,
  memberIds: readonly string[] | null,
): string[] | undefined {
  if (!claimed?.length) return undefined;
  const inBody = new Set(mentionTokens(body));
  const ok = [...new Set(claimed.map((c) => c.toLowerCase()))].filter(
    (id) => inBody.has(id) && (!memberIds || memberIds.some((m) => m.toLowerCase() === id)),
  );
  return ok.length ? ok : undefined;
}
