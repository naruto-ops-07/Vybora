/**
 * Pure helpers for the wave A message features (edit, pin, polls, mentions,
 * search, message info). Everything here runs over decrypted LOCAL data
 * only; none of it is ever sent to the server, push or logs. The protocol
 * rules mirror @vybora/e2ee's rules.ts (enforced there on receive).
 */

// ---------------------------------------------------------------- edit

/** A message may be edited by its sender for this long after it was sent. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface EditableLike {
  senderId: string;
  kind: string;
  status: string;
  createdAt: string;
  deleted?: boolean;
  viewOnce?: unknown;
}

/** Milliseconds left to edit (0 when the window has closed). */
export function editWindowRemainingMs(createdAt: string, now: Date): number {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, start + EDIT_WINDOW_MS - now.getTime());
}

/** Whether "Edit" is offered: my own sent text/attachment, not view-once, inside the window. */
export function canEditMessage(m: EditableLike, myUserId: string, now: Date): boolean {
  if (m.senderId !== myUserId || m.deleted || m.viewOnce) return false;
  if (m.kind !== 'text' && m.kind !== 'attachment') return false;
  if (m.status !== 'sent') return false;
  return editWindowRemainingMs(m.createdAt, now) > 0;
}

// ---------------------------------------------------------------- pins

export const MAX_PINS = 3;

export interface PinLike {
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
}

/** Pins after a change: re-pin moves to newest, the oldest drops past the limit. */
export function nextPins<P extends PinLike>(
  pins: readonly P[],
  change: { messageId: string; pinned: boolean; by: string; at: string },
  max = MAX_PINS,
): PinLike[] {
  const rest: PinLike[] = pins.filter((p) => p.messageId !== change.messageId);
  if (!change.pinned) return rest;
  const next = [...rest, { messageId: change.messageId, pinnedBy: change.by, pinnedAt: change.at }];
  return next.slice(Math.max(0, next.length - max));
}

/** Pinning a new message when full replaces this one (the oldest); null when there's room. */
export function pinWouldReplace<P extends PinLike>(
  pins: readonly P[],
  messageId: string,
  max = MAX_PINS,
): P | null {
  if (pins.some((p) => p.messageId === messageId) || pins.length < max) return null;
  return pins[0] ?? null;
}

/** Who may pin: anyone in a direct chat; in groups, admins only when the admins-only setting is on. */
export function canPin(o: {
  isGroup: boolean;
  settingsPolicy?: 'everyone' | 'admins' | string | null;
  myRole?: 'admin' | 'member' | string | null;
}): boolean {
  if (!o.isGroup || o.settingsPolicy !== 'admins') return true;
  return o.myRole === 'admin';
}

// ---------------------------------------------------------------- polls

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 12;

export interface PollLike {
  question: string;
  options: readonly string[];
  multi: boolean;
  votes: Readonly<Record<string, readonly number[]>>;
}

export interface PollTally {
  options: { index: number; label: string; count: number; voters: string[]; share: number }[];
  /** People who have a current vote. */
  totalVoters: number;
  myChoices: number[];
  /** Index(es) with the most votes (empty when nobody voted). */
  leading: number[];
}

/** Live tally from each member's current vote (invalid indexes ignored). */
export function pollTally(poll: PollLike, myUserId?: string): PollTally {
  const options = poll.options.map((label, index) => ({
    index,
    label,
    count: 0,
    voters: [] as string[],
    share: 0,
  }));
  let totalVoters = 0;
  for (const [userId, raw] of Object.entries(poll.votes)) {
    const choices = [...new Set(raw)].filter((c) => c >= 0 && c < options.length);
    const valid = poll.multi ? choices : choices.slice(0, 1);
    if (!valid.length) continue;
    totalVoters++;
    for (const c of valid) {
      options[c]!.count++;
      options[c]!.voters.push(userId);
    }
  }
  for (const o of options) o.share = totalVoters ? o.count / totalVoters : 0;
  const max = Math.max(0, ...options.map((o) => o.count));
  return {
    options,
    totalVoters,
    myChoices: myUserId ? [...(poll.votes[myUserId] ?? [])].sort((a, b) => a - b) : [],
    leading: max ? options.filter((o) => o.count === max).map((o) => o.index) : [],
  };
}

/** The choice set after tapping an option (single: switch/undo; multi: toggle). */
export function toggleVote(poll: { multi: boolean }, current: readonly number[], option: number) {
  const has = current.includes(option);
  if (!poll.multi) return has ? [] : [option];
  return (has ? current.filter((c) => c !== option) : [...current, option]).sort((a, b) => a - b);
}

/** Form check before sending a poll; returns an error code or null. */
export function validatePollDraft(question: string, options: readonly string[]) {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (!question.trim()) return 'question_required' as const;
  if (question.trim().length > 300) return 'question_too_long' as const;
  if (opts.length < POLL_MIN_OPTIONS) return 'too_few_options' as const;
  if (opts.length > POLL_MAX_OPTIONS) return 'too_many_options' as const;
  if (opts.some((o) => o.length > 100)) return 'option_too_long' as const;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
    return 'duplicate_options' as const;
  return null;
}

/** "No votes yet", "1 vote", "7 votes" (counts people with a current vote). */
export const pollVotesLabel = (voters: number) =>
  voters === 0 ? 'No votes yet' : voters === 1 ? '1 vote' : `${voters} votes`;

// ---------------------------------------------------------------- location

/** "51.50735, -0.12776": what a location card shows when it has no label. */
export const formatCoordinates = (lat: number, lng: number) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/**
 * OpenStreetMap at the pin. Only ever opened by the person tapping "Open in
 * Maps": the card itself draws no tiles and makes no request.
 */
export function mapLinkFor(lat: number, lng: number): string {
  const a = lat.toFixed(5);
  const b = lng.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=16/${a}/${b}`;
}

// ---------------------------------------------------------------- mentions

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MENTION_RE = new RegExp(`@\\[(${UUID})\\]`, 'gi');

/** The token stored in a message body for a mention. */
export const mentionToken = (userId: string) => `@[${userId}]`;

export type MentionSegment =
  { type: 'text'; text: string } | { type: 'mention'; userId: string; valid: boolean };

/**
 * Split a body into text and mention segments. A token is `valid` only when
 * its user is in `mentions` (the engine's validated list); others render as text.
 */
export function parseMentions(body: string, mentions?: readonly string[]): MentionSegment[] {
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) out.push({ type: 'text', text: body.slice(last, m.index) });
    const userId = m[1]!.toLowerCase();
    out.push({ type: 'mention', userId, valid: !!mentions?.includes(userId) });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ type: 'text', text: body.slice(last) });
  return out;
}

/**
 * Body as plain text for previews, copy and search: `@Name` for each
 * VALIDATED mention (ids in `mentions`, the engine's checked list). Tokens
 * that aren't validated stay as their literal text, never a name.
 */
export function renderMentions(
  body: string,
  mentions: readonly string[] | undefined,
  nameOf?: (userId: string) => string,
): string {
  return body.replace(MENTION_RE, (token, id: string) => {
    const uid = id.toLowerCase();
    return mentions?.includes(uid) ? `@${nameOf?.(uid) ?? 'someone'}` : token;
  });
}

/** User ids mentioned by token, in order (what to pass as `mentions` when sending). */
export function mentionIdsIn(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const id = m[1]!.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The "@que" being typed at the cursor, for the member picker (null when none). */
export function mentionQueryAt(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = /(^|\s)@([^\s@[\]]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[2]!.length - 1, query: m[2]! };
}

/** Replace the "@que" at `start..cursor` with a mention token (plus a space). */
export function insertMention(text: string, start: number, cursor: number, userId: string) {
  const token = `${mentionToken(userId)} `;
  return { text: text.slice(0, start) + token + text.slice(cursor), cursor: start + token.length };
}

/** "You were mentioned": a validated mention of me. */
export const mentionsMe = (m: { mentions?: readonly string[] }, myUserId: string) =>
  !!m.mentions?.includes(myUserId.toLowerCase());

// ---------------------------------------------------------------- search

export interface SearchableLike {
  id: string;
  createdAt: string;
  deleted?: boolean;
  body?: string;
  mentions?: readonly string[];
  caption?: string;
  attachment?: { name?: string };
  contact?: { displayName: string; username: string };
  location?: { label?: string };
  poll?: { question: string; options: readonly string[] };
}

/** Case- and accent-insensitive comparison form (one char in → one char out where possible). */
export const foldText = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** The text a message can be found by. */
export function searchableTextOf(m: SearchableLike, nameOf?: (userId: string) => string): string {
  if (m.deleted) return '';
  return [
    m.body && renderMentions(m.body, m.mentions, nameOf),
    m.caption,
    m.attachment?.name,
    m.contact && `${m.contact.displayName} @${m.contact.username}`,
    m.location?.label,
    m.poll && [m.poll.question, ...m.poll.options].join(' · '),
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface SearchHit<M> {
  message: M;
  /** Display text (mentions rendered) and the matched ranges in it. */
  text: string;
  ranges: [number, number][];
}

/**
 * Local search: every word of the query must appear (accent/case-insensitive).
 * Newest first. Pure: pass messages from one chat or many.
 */
export function searchMessages<M extends SearchableLike>(
  messages: readonly M[],
  query: string,
  opts: { nameOf?: (userId: string) => string; limit?: number } = {},
): SearchHit<M>[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit<M>[] = [];
  for (const message of messages) {
    const text = searchableTextOf(message, opts.nameOf);
    if (!text) continue;
    const folded = foldText(text);
    // Folding may change length (rare ligatures); ranges are exact only when it doesn't.
    const exact = folded.length === text.length;
    const ranges: [number, number][] = [];
    let ok = true;
    for (const w of words) {
      const i = folded.indexOf(w);
      if (i < 0) {
        ok = false;
        break;
      }
      if (exact) ranges.push([i, i + w.length]);
    }
    if (ok) hits.push({ message, text, ranges: ranges.sort((a, b) => a[0] - b[0]) });
  }
  return hits
    .sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt))
    .slice(0, opts.limit ?? 100);
}

/** A short excerpt around the first match (for result rows). */
export function searchSnippet(hit: { text: string; ranges: [number, number][] }, radius = 40) {
  const first = hit.ranges[0];
  if (!first || hit.text.length <= radius * 2) return { text: hit.text, ranges: hit.ranges };
  const start = Math.max(0, first[0] - radius);
  const end = Math.min(hit.text.length, first[1] + radius);
  const prefix = start > 0 ? '…' : '';
  const shift = start - prefix.length;
  return {
    text: prefix + hit.text.slice(start, end) + (end < hit.text.length ? '…' : ''),
    ranges: hit.ranges
      .filter(([a, b]) => a >= start && b <= end)
      .map(([a, b]) => [a - shift, b - shift] as [number, number]),
  };
}

// ---------------------------------------------------------------- message info

export interface MessageInfoRow {
  userId: string;
  delivered: boolean;
  read: boolean;
}

/**
 * "Message info" for one of my messages, from the existing per-member
 * delivered/read positions (the same receipts as the ticks).
 */
export function messageInfo(
  m: { senderId: string; seq: number | null },
  members: readonly { id: string; read_seq: number; delivered_seq: number }[],
): { read: MessageInfoRow[]; delivered: MessageInfoRow[]; pending: MessageInfoRow[] } {
  const rows = members
    .filter((x) => x.id !== m.senderId)
    .map((x) => {
      const read = m.seq != null && x.read_seq >= m.seq;
      return {
        userId: x.id,
        read,
        delivered: read || (m.seq != null && x.delivered_seq >= m.seq),
      };
    });
  return {
    read: rows.filter((r) => r.read),
    delivered: rows.filter((r) => r.delivered && !r.read),
    pending: rows.filter((r) => !r.delivered),
  };
}
