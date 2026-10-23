/**
 * Composer rules for wave A: mentions shown as `@Name` while the payload carries
 * `@[id]` tokens, "you were mentioned", and the formats view once may carry.
 * Local only: nothing here is sent anywhere but inside the encrypted payload.
 */
import { detectMime, type SniffedMime } from '../media';
import { mentionsMe, parseMentions } from './features';

/** A mention picked in the composer: the person and the name shown for them. */
export interface MentionEntry {
  userId: string;
  name: string;
}

/**
 * A stored body as composer text: each validated `@[id]` becomes `@Name` and is
 * remembered as an entry; any other token stays literal (it was never a mention).
 */
export function mentionsToDisplay(
  body: string,
  mentions: readonly string[] | undefined,
  nameOf: (userId: string) => string,
): { text: string; entries: MentionEntry[] } {
  const entries: MentionEntry[] = [];
  let text = '';
  for (const s of parseMentions(body, mentions)) {
    if (s.type === 'text') text += s.text;
    else if (!s.valid) text += `@[${s.userId}]`;
    else {
      const name = nameOf(s.userId);
      entries.push({ userId: s.userId, name });
      text += `@${name}`;
    }
  }
  return { text, entries };
}

const WORD = /[\p{L}\p{N}_]/u;

/** Where `@name` stands on its own (not inside a word, not a longer name). */
function occurrences(text: string, name: string): number[] {
  const needle = `@${name}`;
  const out: number[] = [];
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
    const before = text[i - 1];
    const after = text[i + needle.length];
    if ((before === undefined || !WORD.test(before)) && (after === undefined || !WORD.test(after)))
      out.push(i);
  }
  return out;
}

/**
 * Composer text back to a payload: each picked mention claims the first free
 * `@Name` for it, in any order, so editing around it is safe. A mention whose
 * name was edited away is dropped; text typed as "@Name" without picking stays text.
 */
export function displayToPayload(
  text: string,
  entries: readonly MentionEntry[],
): { body: string; mentions: string[] } {
  const claimed: { at: number; len: number; userId: string }[] = [];
  for (const e of entries) {
    const len = e.name.length + 1;
    const at = occurrences(text, e.name).find(
      (i) => !claimed.some((c) => i < c.at + c.len && c.at < i + len),
    );
    if (at !== undefined) claimed.push({ at, len, userId: e.userId });
  }
  claimed.sort((a, b) => a.at - b.at);
  let body = '';
  let last = 0;
  const mentions: string[] = [];
  for (const c of claimed) {
    body += `${text.slice(last, c.at)}@[${c.userId}]`;
    last = c.at + c.len;
    if (!mentions.includes(c.userId)) mentions.push(c.userId);
  }
  return { body: body + text.slice(last), mentions };
}

/** Replace the "@que" at `start..cursor` with `@Name ` (the picker's choice). */
export function insertMentionDisplay(text: string, start: number, cursor: number, name: string) {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(cursor),
    cursor: start + inserted.length,
  };
}

/** Unread messages from others that mention me (validated), oldest first. */
export function unreadMentions<
  M extends {
    id: string;
    seq: number | null;
    senderId: string;
    deleted?: boolean;
    mentions?: readonly string[];
  },
>(messages: readonly M[], myUserId: string, lastReadSeq: number): string[] {
  return messages
    .filter(
      (m) =>
        m.seq !== null &&
        m.seq > lastReadSeq &&
        m.senderId !== myUserId &&
        !m.deleted &&
        mentionsMe(m, myUserId),
    )
    .sort((a, b) => a.seq! - b.seq!)
    .map((m) => m.id);
}

/** What a view-once photo or video may be: exactly what the viewer can show. */
export const VIEW_ONCE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const satisfies readonly SniffedMime[];

/** The file's real type when it can go view once (by its signature), else null. */
export function viewOnceFormat(bytes: Uint8Array): (typeof VIEW_ONCE_TYPES)[number] | null {
  const mime = detectMime(bytes);
  return (VIEW_ONCE_TYPES as readonly string[]).includes(mime ?? '')
    ? (mime as (typeof VIEW_ONCE_TYPES)[number])
    : null;
}
