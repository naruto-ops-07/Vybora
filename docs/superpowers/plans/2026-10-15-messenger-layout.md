# Messenger Layout & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give VYBORA's web and mobile messaging a WhatsApp/Signal-familiar layout (runs + tails, date chips, unread divider, jump-to-latest, swipe-to-reply, message menu, select mode, rich chat rows, last seen) plus a per-device Accessibility settings page, without breaking VYBORA's design rules.

**Architecture:** Behaviour lives in pure, unit-tested functions in `packages/core/src/chat/` (thread layout, row preview, receipts, header status, time wording, swipe threshold, message actions, accessibility prefs). Web (React + Tailwind + Radix) and mobile (React Native + gesture-handler + Reanimated) each render those results natively. "Last seen" adds one additive Supabase migration with server-side privacy rules.

**Tech Stack:** TypeScript, Vitest (core/web/db), Jest + jest-expo (mobile), React 19, Tailwind 4, `@radix-ui/react-context-menu` (new), React Native 0.86 / Expo SDK 57, `react-native-gesture-handler` 2.32, `react-native-reanimated` 4.5, `expo-haptics`, `expo-secure-store`, Supabase Postgres (PGlite test harness).

**Spec:** `docs/superpowers/specs/2026-10-15-messenger-layout-design.md`

## Global Constraints

- Design rules (verbatim from spec): no pills, radii 4/8/12 only, no shadows, no gradients, Archivo + IBM Plex Mono, Phosphor icons. No WhatsApp/Signal names, logos or colours.
- No Lucide icons, no emoji as interface icons (reaction emoji are message content), no hover lift/scale animations.
- Interface copy is sentence case; no ALL-CAPS labels.
- Accessibility prefs are **per device**, never sent to the server. Storage key `vybora.a11y` on both platforms (SecureStore keys may not contain `:`; this replaces the spec's `vybora:a11y`).
- Mobile stores prefs with `expo-secure-store` (already installed) instead of AsyncStorage, to avoid adding a native module.
- Text sizes: `sm` 13 px, `md` 15 px (default), `lg` 17 px, `xl` 20 px.
- Run rule: same sender, `< 5 min` apart, same local day, no date/unread item between.
- Swipe: `dx ≥ 64` px arms; release while armed, or `vx ≥ 800` px/s with `dx ≥ 24`, triggers; rightward only; vertical-dominant movement never arms.
- Typing in the chat list: at most the 20 most recently active chats.
- Last seen: reciprocal; only for users who share a chat; both sides' `show_online` true; no block in either direction; minute precision; ≤ 100 ids per call.
- Migration is additive and is **not** pushed to the hosted project until the user says so.
- Never print or commit secrets; never log message plaintext.
- The workspace is **not a git repository**. Commit steps apply only if the user has run `git init`; otherwise skip them.
- Report test results exactly as run (no fabricated passes).

## Review Focus

1. **Time zones and DST** — a message sent at 23:30 UTC must show under the reader's local day ("Today" in Asia/Kolkata, "Yesterday" in UTC), and the US DST change day must not create a duplicate or missing day. → Task 1 tests.
2. **Stale typing indicators** — if a "typing" broadcast is never followed by "stopped", the chat row must fall back to the normal preview after 5 s. → Task 11 test.
3. **Someone who has never been active since the migration** (no `user_activity` row) — `last_seen` must return nothing and the header must show the fallback line, not crash. → Task 5 test + Task 3 `headerStatus` test.
4. **Last-seen request fails (offline / RPC error)** — the header must keep working with no error toast. → Task 12 test.
5. **Corrupt or old stored accessibility prefs** (invalid JSON, unknown values, missing fields) — load defaults field by field, never throw. → Task 4 test.

---

## File Structure

**Shared (`packages/core/src/chat/`)**

| File | Responsibility |
| --- | --- |
| `time.ts` | `dayKey`, `dayLabel`, `formatClock`, `formatLastSeen`, `formatRowTime`, `formatUnread` |
| `layout.ts` | `layoutThread` → date / unread / message items with run flags |
| `preview.ts` | `Receipt`, `receiptOf`, `messageSummary`, `chatRowPreview`, `selectionToText`, `headerStatus`, `messageActions` |
| `swipe.ts` | `SWIPE_REPLY_THRESHOLD`, `swipeReplyDecision` |
| `a11y.ts` | `A11yPrefs`, defaults, `parseA11yPrefs`, `resolveReduceMotion`, `TEXT_SIZE_PX`, `A11Y_STORAGE_KEY` |
| `index.ts` | re-exports |

`packages/config/src/index.ts` gains `highContrastThemes`.

**Database / API**

- `supabase/migrations/20261015000012_last_seen.sql`, `supabase/tests/last-seen.test.ts`
- `packages/api/src/connect.ts` (`touchActivity`, `fetchLastSeen`), `packages/api/src/keys.ts` (`qk.connect.lastSeen`), `packages/types/src/database.ts` (regenerated)

**Web (`apps/web/src/`)**

- `features/a11y/A11yProvider.tsx`, `features/a11y/AccessibilityPage.tsx`, `features/a11y/a11y.test.tsx`
- `features/connect/ThreadParts.tsx` (DateChip, UnreadDivider, JumpToLatest), `features/connect/threadKeys.ts`, `features/connect/announce.ts`, `features/connect/useSwipeReply.ts`, `features/connect/MessageMenu.tsx`, `features/connect/SelectBar.tsx`, `features/connect/ChatRowParts.tsx` (RowPreviewText, ChatRowMenu), `features/connect/thread.test.tsx`
- Modified: `Bubble.tsx`, `ChatPane.tsx`, `InboxPane.tsx`, `hooks.ts`, `ConnectProvider.tsx`, `PrivacyPage.tsx`, `CommandPalette.tsx`, `features/settings/SettingsNav.tsx`, `app/router.tsx`, `app/App.tsx`, `routes/Landing.tsx`, `routes/landing/motion.ts`, `styles/index.css`, `test/utils.tsx`, `test/setup.ts`

**Mobile (`apps/mobile/src/`)**

- `lib/a11y.tsx`, `lib/haptics.ts`, `app/messages/accessibility.tsx`, `features/connect/ui/SwipeToReply.tsx`, `features/connect/ui/ThreadParts.tsx`, `features/connect/ui/UndoBar.tsx`, `__tests__/a11y.test.tsx`, `__tests__/thread.test.tsx`
- Modified: `lib/theme.ts`, `components/Text.tsx`, `app/_layout.tsx`, `app/settings.tsx`, `app/messages/[id].tsx`, `app/messages/index.tsx`, `app/messages/privacy.tsx`, `features/connect/ui/Bubble.tsx`, `features/connect/ui/MessageActions.tsx`, `features/connect/ui/Composer.tsx`, `features/connect/hooks.ts`, `features/connect/ConnectProvider.tsx`

**Docs:** `docs/DESIGN_SYSTEM.md`, `docs/FEATURE_STATUS.md`, `docs/SECURITY.md`, `docs/CONNECT.md`, `CHANGELOG.md`

---

### Task 1: Shared time wording (`packages/core/src/chat/time.ts`)

**Files:**
- Create: `packages/core/src/chat/time.ts`
- Create: `packages/core/src/chat/index.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './chat';`)
- Test: `packages/core/src/chat/time.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TimeOpts { timeZone?: string; locale?: string }`
  - `dayKey(date: Date | string, opts?: TimeOpts): string` → `'YYYY-MM-DD'`
  - `dayLabel(date: Date | string, now: Date, opts?: TimeOpts): string`
  - `formatClock(date: Date | string, opts?: TimeOpts): string`
  - `formatLastSeen(at: Date | string, now: Date, opts?: TimeOpts): string`
  - `formatRowTime(at: Date | string, now: Date, opts?: TimeOpts): string`
  - `formatUnread(n: number): string`

- [ ] **Step 1: Write the failing test**

`packages/core/src/chat/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, formatLastSeen, formatRowTime, formatUnread } from './time';

const utc = { timeZone: 'UTC', locale: 'en-GB' };
// 2026-10-15 is a Thursday.
const now = new Date('2026-10-15T20:00:00Z');

describe('dayLabel', () => {
  it('names today, yesterday and the last week, then short dates', () => {
    expect(dayLabel('2026-10-15T09:00:00Z', now, utc)).toBe('Today');
    expect(dayLabel('2026-10-14T23:30:00Z', now, utc)).toBe('Yesterday');
    expect(dayLabel('2026-10-12T10:00:00Z', now, utc)).toBe('Monday');
    expect(dayLabel('2026-10-05T10:00:00Z', now, utc)).toBe('Mon 5 Oct');
    expect(dayLabel('2025-12-30T10:00:00Z', now, utc)).toBe('Tue 30 Dec 2025');
  });

  it('uses the reader’s time zone for the day boundary', () => {
    const noon = new Date('2026-10-15T12:00:00Z');
    expect(dayLabel('2026-10-14T23:30:00Z', noon, { ...utc, timeZone: 'UTC' })).toBe('Yesterday');
    expect(dayLabel('2026-10-14T23:30:00Z', noon, { ...utc, timeZone: 'Asia/Kolkata' })).toBe('Today');
  });

  it('keeps one calendar day across the US daylight-saving change', () => {
    const ny = { timeZone: 'America/New_York', locale: 'en-GB' };
    // 2026-11-01 01:30 EDT and 01:30 EST are both on 1 November.
    expect(dayKey('2026-11-01T05:30:00Z', ny)).toBe('2026-11-01');
    expect(dayKey('2026-11-01T06:30:00Z', ny)).toBe('2026-11-01');
    expect(dayLabel('2026-11-01T06:30:00Z', new Date('2026-11-02T15:00:00Z'), ny)).toBe('Yesterday');
  });
});

describe('formatLastSeen', () => {
  const at = new Date('2026-10-15T14:05:30Z');
  it('words recent activity like a messenger', () => {
    expect(formatLastSeen('2026-10-15T14:05:00Z', at, utc)).toBe('last seen just now');
    expect(formatLastSeen('2026-10-15T09:12:00Z', at, utc)).toBe('last seen today at 09:12');
    expect(formatLastSeen('2026-10-14T18:40:00Z', at, utc)).toBe('last seen yesterday at 18:40');
    expect(formatLastSeen('2026-10-12T18:40:00Z', at, utc)).toBe('last seen Monday at 18:40');
    expect(formatLastSeen('2026-10-01T10:00:00Z', at, utc)).toBe('last seen 1 Oct');
    expect(formatLastSeen('2025-10-01T10:00:00Z', at, utc)).toBe('last seen 1 Oct 2025');
  });
});

describe('formatRowTime', () => {
  it('shows a clock today, then Yesterday, weekday, date', () => {
    expect(formatRowTime('2026-10-15T09:12:00Z', now, utc)).toBe('09:12');
    expect(formatRowTime('2026-10-14T09:12:00Z', now, utc)).toBe('Yesterday');
    expect(formatRowTime('2026-10-12T09:12:00Z', now, utc)).toBe('Mon');
    expect(formatRowTime('2026-10-01T09:12:00Z', now, utc)).toBe('1 Oct');
  });
});

describe('formatUnread', () => {
  it('caps at 99+ and hides zero', () => {
    expect(formatUnread(0)).toBe('');
    expect(formatUnread(5)).toBe('5');
    expect(formatUnread(99)).toBe('99');
    expect(formatUnread(100)).toBe('99+');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/time.test.ts`
Expected: FAIL — `Failed to resolve import "./time"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/chat/time.ts`:

```ts
export interface TimeOpts {
  /** IANA zone; defaults to the device zone. */
  timeZone?: string;
  /** BCP 47 locale for names and clock format; defaults to the device locale. */
  locale?: string;
}

const MINUTE = 60_000;

function parts(date: Date, opts: TimeOpts, fmt: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(opts.locale, { ...fmt, timeZone: opts.timeZone }).formatToParts(
    date,
  );
}

function part(ps: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return ps.find((p) => p.type === type)?.value ?? '';
}

/** Calendar day of `date` in the reader's zone, as 'YYYY-MM-DD'. */
export function dayKey(date: Date | string, opts: TimeOpts = {}): string {
  const ps = parts(
    new Date(date),
    { timeZone: opts.timeZone, locale: 'en-CA' },
    { year: 'numeric', month: '2-digit', day: '2-digit' },
  );
  return `${part(ps, 'year')}-${part(ps, 'month')}-${part(ps, 'day')}`;
}

/** Whole calendar days from day `a` to day `b`. */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function formatClock(date: Date | string, opts: TimeOpts = {}): string {
  return new Intl.DateTimeFormat(opts.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: opts.timeZone,
  }).format(new Date(date));
}

function weekday(date: Date, opts: TimeOpts, style: 'long' | 'short') {
  return new Intl.DateTimeFormat(opts.locale, { weekday: style, timeZone: opts.timeZone }).format(
    date,
  );
}

/** "Mon 12 Oct" (or "12 Oct"), with the year only when it isn't the current one. */
function shortDate(date: Date, now: Date, opts: TimeOpts, withWeekday: boolean) {
  const ps = parts(date, opts, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sameYear = part(ps, 'year') === part(parts(now, opts, { year: 'numeric' }), 'year');
  return [
    withWeekday ? part(ps, 'weekday') : '',
    part(ps, 'day'),
    part(ps, 'month'),
    sameYear ? '' : part(ps, 'year'),
  ]
    .filter(Boolean)
    .join(' ');
}

export function dayLabel(date: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(date);
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return weekday(d, opts, 'long');
  return shortDate(d, now, opts, true);
}

export function formatLastSeen(at: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(at);
  if (now.getTime() - d.getTime() < MINUTE) return 'last seen just now';
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  const clock = formatClock(d, opts);
  if (diff <= 0) return `last seen today at ${clock}`;
  if (diff === 1) return `last seen yesterday at ${clock}`;
  if (diff < 7) return `last seen ${weekday(d, opts, 'long')} at ${clock}`;
  return `last seen ${shortDate(d, now, opts, false)}`;
}

export function formatRowTime(at: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(at);
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  if (diff <= 0) return formatClock(d, opts);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return weekday(d, opts, 'short');
  return shortDate(d, now, opts, false);
}

export function formatUnread(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}
```

`packages/core/src/chat/index.ts`:

```ts
export * from './time';
```

Append to `packages/core/src/index.ts`:

```ts
export * from './chat';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/time.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat packages/core/src/index.ts
git commit -m "feat(core): messenger time wording (day labels, last seen, row time)"
```

---

### Task 2: Thread layout (`layoutThread`)

**Files:**
- Create: `packages/core/src/chat/layout.ts`
- Modify: `packages/core/src/chat/index.ts`
- Test: `packages/core/src/chat/layout.test.ts`

**Interfaces:**
- Consumes: `dayKey`, `dayLabel`, `TimeOpts` (Task 1).
- Produces:
  - `interface ThreadMessageLike { id: string; senderId: string; createdAt: string; seq: number | null }`
  - `type ThreadItem<M>` = `{ type: 'date'; key: string; label: string; day: string }` | `{ type: 'unread'; key: 'unread'; count: number }` | `{ type: 'message'; key: string; message: M; mine: boolean; runStart: boolean; runEnd: boolean }`
  - `interface LayoutOptions extends TimeOpts { myUserId: string; lastReadSeq: number; now: Date }`
  - `layoutThread<M extends ThreadMessageLike>(messages: readonly M[], opts: LayoutOptions): ThreadItem<M>[]` — input ascending by seq.
  - `RUN_GAP_MS = 300_000`

- [ ] **Step 1: Write the failing test**

`packages/core/src/chat/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { layoutThread, type ThreadItem } from './layout';

type M = { id: string; senderId: string; createdAt: string; seq: number | null };
const opts = {
  myUserId: 'me',
  lastReadSeq: 100,
  now: new Date('2026-10-15T20:00:00Z'),
  timeZone: 'UTC',
  locale: 'en-GB',
};
const msg = (id: string, senderId: string, createdAt: string, seq: number | null = Number(id)) => ({
  id,
  senderId,
  createdAt,
  seq,
});
const shape = (items: ThreadItem<M>[]) =>
  items.map((i) =>
    i.type === 'message'
      ? `${i.key}${i.runStart ? '<' : ''}${i.runEnd ? '>' : ''}`
      : i.type === 'date'
        ? `[${i.label}]`
        : `(${i.count} unread)`,
  );

describe('layoutThread', () => {
  it('returns nothing for an empty chat', () => {
    expect(layoutThread([], opts)).toEqual([]);
  });

  it('groups consecutive messages from one sender into a run', () => {
    const items = layoutThread(
      [msg('1', 'maya', '2026-10-15T10:00:00Z'), msg('2', 'maya', '2026-10-15T10:01:00Z')],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '1<', '2>']);
  });

  it('starts a new run on sender change or a 5-minute gap', () => {
    const items = layoutThread(
      [
        msg('1', 'maya', '2026-10-15T10:00:00Z'),
        msg('2', 'me', '2026-10-15T10:01:00Z'),
        msg('3', 'me', '2026-10-15T10:06:00Z'),
      ],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '1<>', '2<>', '3<>']);
  });

  it('inserts a date item at each day boundary and breaks the run', () => {
    const items = layoutThread(
      [msg('1', 'maya', '2026-10-14T23:59:00Z'), msg('2', 'maya', '2026-10-15T00:00:30Z')],
      opts,
    );
    expect(shape(items)).toEqual(['[Yesterday]', '1<>', '[Today]', '2<>']);
  });

  it('places one unread divider before the first unread incoming message', () => {
    const items = layoutThread(
      [
        msg('99', 'maya', '2026-10-15T10:00:00Z'),
        msg('101', 'maya', '2026-10-15T10:01:00Z'),
        msg('102', 'me', '2026-10-15T10:02:00Z'),
        msg('103', 'maya', '2026-10-15T10:03:00Z'),
      ],
      opts,
    );
    expect(shape(items)).toEqual(['[Today]', '99<>', '(2 unread)', '101<>', '102<>', '103<>']);
  });

  it('shows no divider when everything is read, mine, or still sending', () => {
    const items = layoutThread(
      [
        msg('90', 'maya', '2026-10-15T10:00:00Z'),
        msg('120', 'me', '2026-10-15T10:01:00Z'),
        msg('x', 'maya', '2026-10-15T10:02:00Z', null),
      ],
      opts,
    );
    expect(items.some((i) => i.type === 'unread')).toBe(false);
  });

  it('marks mine correctly', () => {
    const [, first] = layoutThread([msg('1', 'me', '2026-10-15T10:00:00Z')], opts);
    expect(first).toMatchObject({ type: 'message', mine: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/chat/layout.ts`:

```ts
import { dayKey, dayLabel, type TimeOpts } from './time';

export interface ThreadMessageLike {
  id: string;
  senderId: string;
  createdAt: string;
  seq: number | null;
}

export type ThreadItem<M extends ThreadMessageLike> =
  | { type: 'date'; key: string; label: string; day: string }
  | { type: 'unread'; key: 'unread'; count: number }
  | {
      type: 'message';
      key: string;
      message: M;
      mine: boolean;
      /** First bubble of a run: shows the sender name in groups. */
      runStart: boolean;
      /** Last bubble of a run: gets the tail (and the avatar in groups). */
      runEnd: boolean;
    };

export interface LayoutOptions extends TimeOpts {
  myUserId: string;
  /** Read position captured when the chat was opened (not the live value). */
  lastReadSeq: number;
  now: Date;
}

export const RUN_GAP_MS = 5 * 60_000;

type MessageItem<M extends ThreadMessageLike> = Extract<ThreadItem<M>, { type: 'message' }>;

/** Turn ascending messages into render items: date chips, one unread divider, runs. */
export function layoutThread<M extends ThreadMessageLike>(
  messages: readonly M[],
  opts: LayoutOptions,
): ThreadItem<M>[] {
  const isUnread = (m: M) =>
    m.senderId !== opts.myUserId && m.seq !== null && m.seq > opts.lastReadSeq;
  const firstUnread = messages.findIndex(isUnread);
  const unreadCount = firstUnread < 0 ? 0 : messages.slice(firstUnread).filter(isUnread).length;

  const items: ThreadItem<M>[] = [];
  let lastMessage: MessageItem<M> | undefined;
  let prev: M | undefined;
  let prevDay = '';

  messages.forEach((m, i) => {
    let breakRun = false;
    const day = dayKey(m.createdAt, opts);
    if (day !== prevDay) {
      items.push({ type: 'date', key: `date-${day}`, label: dayLabel(m.createdAt, opts.now, opts), day });
      prevDay = day;
      breakRun = true;
    }
    if (i === firstUnread) {
      items.push({ type: 'unread', key: 'unread', count: unreadCount });
      breakRun = true;
    }
    const runStart =
      breakRun ||
      !prev ||
      prev.senderId !== m.senderId ||
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) >= RUN_GAP_MS;
    if (runStart && lastMessage) lastMessage.runEnd = true;
    const item: MessageItem<M> = {
      type: 'message',
      key: m.id,
      message: m,
      mine: m.senderId === opts.myUserId,
      runStart,
      runEnd: false,
    };
    items.push(item);
    lastMessage = item;
    prev = m;
  });
  if (lastMessage) lastMessage.runEnd = true;
  return items;
}
```

`packages/core/src/chat/index.ts` becomes:

```ts
export * from './time';
export * from './layout';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/layout.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat
git commit -m "feat(core): layoutThread for runs, date chips and unread divider"
```

---

### Task 3: Previews, receipts, header status, actions, swipe (`preview.ts`, `swipe.ts`)

**Files:**
- Create: `packages/core/src/chat/preview.ts`, `packages/core/src/chat/swipe.ts`
- Modify: `packages/core/src/chat/index.ts`
- Test: `packages/core/src/chat/preview.test.ts`

**Interfaces:**
- Consumes: `formatClock`, `formatLastSeen`, `TimeOpts` (Task 1).
- Produces:
  - `type Receipt = 'sending' | 'failed' | 'sent' | 'delivered' | 'read'`
  - `receiptOf(m: { senderId: string; status: string; seq: number | null }, myUserId: string, members: readonly { id: string; read_seq: number; delivered_seq: number }[]): Receipt | undefined`
  - `interface PreviewMessageLike { senderId: string; kind: 'text' | 'attachment' | 'undecryptable'; body?: string; caption?: string; attachment?: { kind: string; name?: string }; deleted?: boolean }`
  - `messageSummary(m: PreviewMessageLike): string`
  - `interface RowPreview { prefix: string | null; text: string; receipt: Receipt | null; typing: boolean }`
  - `chatRowPreview(last: PreviewMessageLike | undefined, opts: { myUserId: string; isGroup: boolean; typingUserIds: readonly string[]; nameOf: (userId: string) => string; receipt?: Receipt }): RowPreview`
  - `selectionToText(messages: readonly (PreviewMessageLike & { createdAt: string })[], opts: TimeOpts & { nameOf: (userId: string) => string }): string`
  - `headerStatus(o: TimeOpts & { isGroup: boolean; memberCount: number; typingNames: readonly string[]; online: boolean; lastSeenAt: string | null; now: Date }): string`
  - `type MessageAction = 'reply' | 'copy' | 'select' | 'delete'`
  - `messageActions(m: { kind: string; deleted?: boolean; status: string }, mine: boolean): MessageAction[]`
  - `SWIPE_REPLY_THRESHOLD = 64`, `type SwipeState = 'idle' | 'armed' | 'trigger'`, `swipeReplyDecision(g: { dx: number; dy: number; vx: number; released: boolean }): SwipeState`

- [ ] **Step 1: Write the failing test**

`packages/core/src/chat/preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  chatRowPreview,
  headerStatus,
  messageActions,
  messageSummary,
  receiptOf,
  selectionToText,
} from './preview';
import { swipeReplyDecision } from './swipe';

const names: Record<string, string> = { maya: 'Maya', leo: 'Leo', me: 'You' };
const nameOf = (id: string) => names[id] ?? 'Someone';
const text = (senderId: string, body: string) => ({ senderId, kind: 'text' as const, body });

describe('receiptOf', () => {
  const members = [
    { id: 'me', read_seq: 0, delivered_seq: 0 },
    { id: 'maya', read_seq: 5, delivered_seq: 8 },
  ];
  it('derives ticks from the other members’ positions', () => {
    expect(receiptOf({ senderId: 'maya', status: 'received', seq: 3 }, 'me', members)).toBeUndefined();
    expect(receiptOf({ senderId: 'me', status: 'sending', seq: null }, 'me', members)).toBe('sending');
    expect(receiptOf({ senderId: 'me', status: 'failed', seq: null }, 'me', members)).toBe('failed');
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 5 }, 'me', members)).toBe('read');
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 7 }, 'me', members)).toBe('delivered');
    expect(receiptOf({ senderId: 'me', status: 'sent', seq: 9 }, 'me', members)).toBe('sent');
  });
});

describe('messageSummary', () => {
  it('describes every kind without leaking more than the local preview', () => {
    expect(messageSummary(text('maya', 'Hi'))).toBe('Hi');
    expect(messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'image' } })).toBe('Photo');
    expect(
      messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'image' }, caption: 'Beach' }),
    ).toBe('Beach');
    expect(messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'voice' } })).toBe('Voice message');
    expect(
      messageSummary({ senderId: 'maya', kind: 'attachment', attachment: { kind: 'file', name: 'a.pdf' } }),
    ).toBe('File: a.pdf');
    expect(messageSummary({ senderId: 'maya', kind: 'undecryptable' })).toBe('Message couldn’t be decrypted');
    expect(messageSummary({ ...text('maya', 'secret'), deleted: true })).toBe('This message was deleted');
  });
});

describe('chatRowPreview', () => {
  const base = { myUserId: 'me', typingUserIds: [], nameOf };
  it('prefixes my messages with You and keeps the receipt', () => {
    expect(chatRowPreview(text('me', 'See you'), { ...base, isGroup: false, receipt: 'read' })).toEqual({
      prefix: 'You',
      text: 'See you',
      receipt: 'read',
      typing: false,
    });
  });
  it('prefixes group messages with the sender and direct ones with nothing', () => {
    expect(chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: true }).prefix).toBe('Maya');
    expect(chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: false }).prefix).toBeNull();
  });
  it('lets typing win over the last message', () => {
    expect(chatRowPreview(text('maya', 'Hi'), { ...base, isGroup: false, typingUserIds: ['maya'] })).toEqual({
      prefix: null,
      text: 'typing…',
      receipt: null,
      typing: true,
    });
    expect(chatRowPreview(undefined, { ...base, isGroup: true, typingUserIds: ['maya'] }).text).toBe('Maya is typing…');
    expect(chatRowPreview(undefined, { ...base, isGroup: true, typingUserIds: ['maya', 'leo'] }).text).toBe(
      '2 people are typing…',
    );
  });
  it('ignores my own typing and handles empty chats', () => {
    expect(chatRowPreview(undefined, { ...base, isGroup: false, typingUserIds: ['me'] })).toEqual({
      prefix: null,
      text: 'No messages yet',
      receipt: null,
      typing: false,
    });
  });
});

describe('selectionToText', () => {
  it('joins selected messages as [time] name: text lines', () => {
    expect(
      selectionToText(
        [
          { ...text('maya', 'Dinner?'), createdAt: '2026-10-15T18:01:00Z' },
          { ...text('me', 'Yes'), createdAt: '2026-10-15T18:02:00Z' },
        ],
        { nameOf, timeZone: 'UTC', locale: 'en-GB' },
      ),
    ).toBe('[18:01] Maya: Dinner?\n[18:02] You: Yes');
  });
});

describe('headerStatus', () => {
  const base = {
    isGroup: false,
    memberCount: 2,
    typingNames: [],
    online: false,
    lastSeenAt: null,
    now: new Date('2026-10-15T14:05:30Z'),
    timeZone: 'UTC',
    locale: 'en-GB',
  };
  it('prefers typing, then online, then last seen, then the fallback', () => {
    expect(headerStatus({ ...base, typingNames: ['Maya'], online: true })).toBe('typing…');
    expect(headerStatus({ ...base, online: true, lastSeenAt: '2026-10-15T09:00:00Z' })).toBe('online');
    expect(headerStatus({ ...base, lastSeenAt: '2026-10-15T09:12:00Z' })).toBe('last seen today at 09:12');
    expect(headerStatus(base)).toBe('end-to-end encrypted');
  });
  it('shows group typing names and member counts', () => {
    expect(headerStatus({ ...base, isGroup: true, memberCount: 5, typingNames: ['Maya', 'Leo'] })).toBe(
      'Maya, Leo are typing…',
    );
    expect(headerStatus({ ...base, isGroup: true, memberCount: 5, typingNames: ['Maya'] })).toBe('Maya is typing…');
    expect(headerStatus({ ...base, isGroup: true, memberCount: 5 })).toBe('5 members');
  });
});

describe('messageActions', () => {
  it('offers actions only for settled, readable messages', () => {
    expect(messageActions({ kind: 'text', status: 'sent' }, true)).toEqual(['reply', 'copy', 'select', 'delete']);
    expect(messageActions({ kind: 'attachment', status: 'received' }, false)).toEqual(['reply', 'select']);
    expect(messageActions({ kind: 'text', status: 'sending' }, true)).toEqual([]);
    expect(messageActions({ kind: 'text', status: 'failed' }, true)).toEqual([]);
    expect(messageActions({ kind: 'undecryptable', status: 'received' }, false)).toEqual([]);
    expect(messageActions({ kind: 'text', status: 'sent', deleted: true }, true)).toEqual([]);
  });
});

describe('swipeReplyDecision', () => {
  it('arms at 64px, triggers on release or a fast flick, never for vertical drags', () => {
    expect(swipeReplyDecision({ dx: 30, dy: 0, vx: 0, released: false })).toBe('idle');
    expect(swipeReplyDecision({ dx: 64, dy: 0, vx: 0, released: false })).toBe('armed');
    expect(swipeReplyDecision({ dx: 70, dy: 0, vx: 0, released: true })).toBe('trigger');
    expect(swipeReplyDecision({ dx: 30, dy: 0, vx: 900, released: true })).toBe('trigger');
    expect(swipeReplyDecision({ dx: 20, dy: 0, vx: 900, released: true })).toBe('idle');
    expect(swipeReplyDecision({ dx: 70, dy: 90, vx: 0, released: true })).toBe('idle');
    expect(swipeReplyDecision({ dx: -80, dy: 0, vx: 0, released: true })).toBe('idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/preview.test.ts`
Expected: FAIL — `Failed to resolve import "./preview"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/chat/preview.ts`:

```ts
import { formatClock, formatLastSeen, type TimeOpts } from './time';

export type Receipt = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/** Ticks for my message, from every other member's delivered/read position. */
export function receiptOf(
  m: { senderId: string; status: string; seq: number | null },
  myUserId: string,
  members: readonly { id: string; read_seq: number; delivered_seq: number }[],
): Receipt | undefined {
  if (m.senderId !== myUserId) return undefined;
  if (m.status === 'sending') return 'sending';
  if (m.status === 'failed') return 'failed';
  const others = members.filter((x) => x.id !== myUserId);
  if (!m.seq || !others.length) return 'sent';
  if (others.every((o) => o.read_seq >= m.seq!)) return 'read';
  if (others.every((o) => o.delivered_seq >= m.seq!)) return 'delivered';
  return 'sent';
}

export interface PreviewMessageLike {
  senderId: string;
  kind: 'text' | 'attachment' | 'undecryptable';
  body?: string;
  caption?: string;
  attachment?: { kind: string; name?: string };
  deleted?: boolean;
}

const ATTACHMENT_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  voice: 'Voice message',
};

/** One-line description of a decrypted message (never more than the device already shows). */
export function messageSummary(m: PreviewMessageLike): string {
  if (m.deleted) return 'This message was deleted';
  if (m.kind === 'undecryptable') return 'Message couldn’t be decrypted';
  if (m.kind === 'attachment') {
    const caption = m.caption?.trim();
    if (caption) return caption;
    const k = m.attachment?.kind ?? 'file';
    return ATTACHMENT_LABEL[k] ?? `File: ${m.attachment?.name ?? 'attachment'}`;
  }
  return m.body ?? '';
}

export interface RowPreview {
  prefix: string | null;
  text: string;
  receipt: Receipt | null;
  typing: boolean;
}

export function chatRowPreview(
  last: PreviewMessageLike | undefined,
  opts: {
    myUserId: string;
    isGroup: boolean;
    typingUserIds: readonly string[];
    nameOf: (userId: string) => string;
    receipt?: Receipt;
  },
): RowPreview {
  const typers = opts.typingUserIds.filter((id) => id !== opts.myUserId);
  if (typers.length) {
    const text = !opts.isGroup
      ? 'typing…'
      : typers.length === 1
        ? `${opts.nameOf(typers[0]!)} is typing…`
        : `${typers.length} people are typing…`;
    return { prefix: null, text, receipt: null, typing: true };
  }
  if (!last) return { prefix: null, text: 'No messages yet', receipt: null, typing: false };
  const mine = last.senderId === opts.myUserId;
  return {
    prefix: mine ? 'You' : opts.isGroup ? opts.nameOf(last.senderId) : null,
    text: messageSummary(last),
    receipt: mine && !last.deleted ? (opts.receipt ?? null) : null,
    typing: false,
  };
}

/** Plain-text copy of selected messages: "[18:01] Maya: Dinner?" per line. */
export function selectionToText(
  messages: readonly (PreviewMessageLike & { createdAt: string })[],
  opts: TimeOpts & { nameOf: (userId: string) => string },
): string {
  return messages
    .map((m) => `[${formatClock(m.createdAt, opts)}] ${opts.nameOf(m.senderId)}: ${messageSummary(m)}`)
    .join('\n');
}

/** The line under a chat's name: typing → online → last seen → fallback. */
export function headerStatus(
  o: TimeOpts & {
    isGroup: boolean;
    memberCount: number;
    typingNames: readonly string[];
    online: boolean;
    lastSeenAt: string | null;
    now: Date;
  },
): string {
  if (o.typingNames.length) {
    if (!o.isGroup) return 'typing…';
    return `${o.typingNames.join(', ')} ${o.typingNames.length > 1 ? 'are' : 'is'} typing…`;
  }
  if (o.isGroup) return `${o.memberCount} members`;
  if (o.online) return 'online';
  if (o.lastSeenAt) return formatLastSeen(o.lastSeenAt, o.now, o);
  return 'end-to-end encrypted';
}

export type MessageAction = 'reply' | 'copy' | 'select' | 'delete';

/** What the message menu offers. Project 2 adds forward/edit/star here. */
export function messageActions(
  m: { kind: string; deleted?: boolean; status: string },
  mine: boolean,
): MessageAction[] {
  if (m.deleted || m.kind === 'undecryptable' || m.status === 'sending' || m.status === 'failed')
    return [];
  return ['reply', ...(m.kind === 'text' ? (['copy'] as const) : []), 'select', ...(mine ? (['delete'] as const) : [])];
}
```

`packages/core/src/chat/swipe.ts`:

```ts
export const SWIPE_REPLY_THRESHOLD = 64;
const FLICK_VELOCITY = 800;
const FLICK_MIN_DX = 24;

export type SwipeState = 'idle' | 'armed' | 'trigger';

/** Shared swipe-to-reply rule for web (touch) and mobile. */
export function swipeReplyDecision(g: {
  dx: number;
  dy: number;
  vx: number;
  released: boolean;
}): SwipeState {
  if (g.dx <= 0 || Math.abs(g.dy) > Math.abs(g.dx)) return 'idle';
  if (!g.released) return g.dx >= SWIPE_REPLY_THRESHOLD ? 'armed' : 'idle';
  if (g.dx >= SWIPE_REPLY_THRESHOLD) return 'trigger';
  return g.vx >= FLICK_VELOCITY && g.dx >= FLICK_MIN_DX ? 'trigger' : 'idle';
}
```

`packages/core/src/chat/index.ts` becomes:

```ts
export * from './time';
export * from './layout';
export * from './preview';
export * from './swipe';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/preview.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat
git commit -m "feat(core): row previews, receipts, header status, message actions, swipe rule"
```

---

### Task 4: Accessibility prefs model + high-contrast tokens

**Files:**
- Create: `packages/core/src/chat/a11y.ts`
- Modify: `packages/core/src/chat/index.ts`, `packages/config/src/index.ts`
- Test: `packages/core/src/chat/a11y.test.ts`

**Interfaces:**
- Consumes: `themes`, `ThemeTokens`, `palette` from `@vybora/config`.
- Produces:
  - `type ReduceMotionPref = 'system' | 'on' | 'off'`, `type TextSize = 'sm' | 'md' | 'lg' | 'xl'`
  - `interface A11yPrefs { reduceMotion: ReduceMotionPref; swipeToReply: boolean; haptics: boolean; textSize: TextSize; highContrast: boolean; alwaysShowActions: boolean }`
  - `DEFAULT_A11Y_PREFS: A11yPrefs`, `TEXT_SIZE_PX: Record<TextSize, number>`, `A11Y_STORAGE_KEY = 'vybora.a11y'`
  - `parseA11yPrefs(raw: string | null | undefined): A11yPrefs`
  - `resolveReduceMotion(pref: ReduceMotionPref, systemReduced: boolean): boolean`
  - `@vybora/config`: `highContrastThemes: { light: ThemeTokens; dark: ThemeTokens }`

- [ ] **Step 1: Write the failing test**

`packages/core/src/chat/a11y.test.ts`:

```ts
import { highContrastThemes } from '@vybora/config';
import { describe, expect, it } from 'vitest';
import { DEFAULT_A11Y_PREFS, parseA11yPrefs, resolveReduceMotion } from './a11y';

describe('parseA11yPrefs', () => {
  it('returns defaults for missing or broken storage', () => {
    expect(parseA11yPrefs(null)).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('not json')).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('[1,2]')).toEqual(DEFAULT_A11Y_PREFS);
  });

  it('keeps valid fields and replaces invalid ones one by one', () => {
    expect(
      parseA11yPrefs(
        JSON.stringify({ textSize: 'xl', highContrast: true, reduceMotion: 'sometimes', haptics: 'yes', extra: 1 }),
      ),
    ).toEqual({ ...DEFAULT_A11Y_PREFS, textSize: 'xl', highContrast: true });
  });
});

describe('resolveReduceMotion', () => {
  it('lets the setting override the system in both directions', () => {
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
    expect(resolveReduceMotion('on', false)).toBe(true);
    expect(resolveReduceMotion('off', true)).toBe(false);
  });
});

/** WCAG 2.x relative luminance contrast. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('high-contrast themes', () => {
  for (const name of ['light', 'dark'] as const) {
    const t = highContrastThemes[name];
    it(`${name}: text 7:1, secondary 4.5:1, borders 3:1`, () => {
      expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.text, t.bubbleIn)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.textMuted, t.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.textSubtle, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.border, t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.danger, t.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/a11y.test.ts`
Expected: FAIL — `Failed to resolve import "./a11y"` (and `highContrastThemes` undefined).

- [ ] **Step 3: Write the implementation**

`packages/core/src/chat/a11y.ts`:

```ts
export type ReduceMotionPref = 'system' | 'on' | 'off';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

/** Per-device accessibility settings (never sent to the server). */
export interface A11yPrefs {
  reduceMotion: ReduceMotionPref;
  swipeToReply: boolean;
  haptics: boolean;
  textSize: TextSize;
  highContrast: boolean;
  alwaysShowActions: boolean;
}

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  reduceMotion: 'system',
  swipeToReply: true,
  haptics: true,
  textSize: 'md',
  highContrast: false,
  alwaysShowActions: false,
};

export const TEXT_SIZE_PX: Record<TextSize, number> = { sm: 13, md: 15, lg: 17, xl: 20 };

/** Valid for localStorage and expo-secure-store (which rejects ':'). */
export const A11Y_STORAGE_KEY = 'vybora.a11y';

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Parse stored prefs field by field; anything invalid falls back to its default. */
export function parseA11yPrefs(raw: string | null | undefined): A11yPrefs {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_A11Y_PREFS };
  const d = data as Record<string, unknown>;
  const def = DEFAULT_A11Y_PREFS;
  return {
    reduceMotion: oneOf(d.reduceMotion, ['system', 'on', 'off'] as const, def.reduceMotion),
    swipeToReply: bool(d.swipeToReply, def.swipeToReply),
    haptics: bool(d.haptics, def.haptics),
    textSize: oneOf(d.textSize, ['sm', 'md', 'lg', 'xl'] as const, def.textSize),
    highContrast: bool(d.highContrast, def.highContrast),
    alwaysShowActions: bool(d.alwaysShowActions, def.alwaysShowActions),
  };
}

export function resolveReduceMotion(pref: ReduceMotionPref, systemReduced: boolean): boolean {
  return pref === 'system' ? systemReduced : pref === 'on';
}
```

Add to `packages/core/src/chat/index.ts`:

```ts
export * from './a11y';
```

In `packages/config/src/index.ts`, after the `themes` block and the `ThemeTokens` type, add:

```ts
/**
 * Accessibility → High contrast. Same keys as `themes`; text ≥ 7:1, secondary
 * text ≥ 4.5:1 and borders ≥ 3:1 against surfaces (checked in core tests).
 */
export const highContrastThemes: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    bg: palette.white,
    surface: palette.white,
    surfaceMuted: '#F1F5F5',
    surfaceStrong: palette.mist200,
    border: palette.slate600,
    borderStrong: palette.graphite700,
    text: palette.ink,
    textMuted: palette.graphite700,
    textSubtle: '#3E4F52',
    accent: palette.teal800,
    accentHover: palette.tealDeep,
    accentSoft: '#CDEDEA',
    onAccent: palette.white,
    bubbleIn: palette.mist200,
    danger: '#8F1B12',
    success: '#065F46',
    warning: '#7C3A06',
  },
  dark: {
    bg: '#000000',
    surface: palette.graphite950,
    surfaceMuted: palette.graphite850,
    surfaceStrong: palette.graphite750,
    border: palette.graphite500,
    borderStrong: palette.graphite400,
    text: palette.white,
    textMuted: '#C9D6D6',
    textSubtle: '#AFC0C1',
    accent: palette.turquoiseLight,
    accentHover: '#99F6E4',
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: palette.graphite750,
    danger: '#FCA5A5',
    success: '#6EE7B7',
    warning: '#FCD34D',
  },
};
```

(If `ThemeTokens` is declared after `themes`, place this block after the `ThemeTokens` line so the type is in scope.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vybora/core exec vitest run src/chat/a11y.test.ts`
Expected: PASS (6 tests). Then `pnpm --filter @vybora/core test` — all core tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat packages/config/src/index.ts
git commit -m "feat(core,config): accessibility prefs model and high-contrast tokens"
```

---

### Task 5: Last-seen migration, DB tests, types and API

**Files:**
- Create: `supabase/migrations/20261015000012_last_seen.sql`
- Test: `supabase/tests/last-seen.test.ts`
- Modify: `packages/types/src/database.ts` (regenerated), `packages/api/src/connect.ts`, `packages/api/src/keys.ts`
- Test: `packages/api/src/lastSeen.test.ts`

**Interfaces:**
- Consumes: `public.shares_conversation_with(uuid)`, `public.user_settings.show_online`, `public.blocks`, `public.try_uuid`, `realtime.topic()` (existing).
- Produces:
  - SQL: `public.touch_activity() returns void`, `public.last_seen(p_user_ids uuid[]) returns table (user_id uuid, last_active_at timestamptz)`, `public.caller_shows_online() returns boolean`
  - TS: `touchActivity(client: VyboraClient): Promise<void>`, `fetchLastSeen(client: VyboraClient, userIds: string[]): Promise<Record<string, string>>`, `qk.connect.lastSeen(userId: string)`

- [ ] **Step 1: Write the failing DB test**

`supabase/tests/last-seen.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';

type User = { id: string; username: string };
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

async function chat(owner: User, other: User) {
  await db.as(owner, `select public.create_secure_conversation('direct', $1::uuid[], null)`, [[other.id]]);
}
const lastSeen = (viewer: User, ids: string[]) =>
  db.as<{ user_id: string; last_active_at: Date }>(viewer, `select * from public.last_seen($1::uuid[])`, [ids]);
const setActive = (u: User, iso: string) =>
  db.admin(
    `insert into user_activity (user_id, last_active_at) values ($1, $2)
     on conflict (user_id) do update set last_active_at = excluded.last_active_at`,
    [u.id, iso],
  );
const showOnline = (u: User, on: boolean) =>
  db.as(u, `update user_settings set show_online = $2 where user_id = $1`, [u.id, on]);

describe('last seen', () => {
  it('returns minute-precision activity only to people who share a chat', async () => {
    const a = await db.createUser('ls_a');
    const b = await db.createUser('ls_b');
    const eve = await db.createUser('ls_eve');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:05:42Z');
    const rows = await lastSeen(b, [a.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.last_active_at.toISOString()).toBe('2026-10-15T10:05:00.000Z');
    expect(await lastSeen(eve, [a.id])).toEqual([]);
  });

  it('returns nothing for someone who was never active', async () => {
    const a = await db.createUser('ls_never_a');
    const b = await db.createUser('ls_never_b');
    await chat(a, b);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('hides it when the target turned online status off', async () => {
    const a = await db.createUser('ls_off_a');
    const b = await db.createUser('ls_off_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await showOnline(a, false);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('is reciprocal: hiding yours hides everyone else’s from you', async () => {
    const a = await db.createUser('ls_rec_a');
    const b = await db.createUser('ls_rec_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await showOnline(b, false);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('is hidden in both directions after a block', async () => {
    const a = await db.createUser('ls_blk_a');
    const b = await db.createUser('ls_blk_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await setActive(b, '2026-10-15T10:00:00Z');
    await db.as(a, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [a.id, b.id]);
    expect(await lastSeen(b, [a.id])).toEqual([]);
    expect(await lastSeen(a, [b.id])).toEqual([]);
  });

  it('rejects more than 100 ids and has no direct table access', async () => {
    const a = await db.createUser('ls_lim_a');
    const ids = Array.from({ length: 101 }, () => a.id);
    await expectDenied(lastSeen(a, ids), /too_many_users/);
    await expectDenied(db.as(a, `select * from user_activity`), /permission denied/);
    await expectDenied(
      db.as(a, `insert into user_activity (user_id) values ($1)`, [a.id]),
      /permission denied/,
    );
  });
});

describe('touch_activity', () => {
  it('stamps the caller only, at most once a minute', async () => {
    const a = await db.createUser('ta_a');
    await db.as(a, `select public.touch_activity()`);
    const [first] = await db.admin<{ last_active_at: Date }>(
      `select last_active_at from user_activity where user_id = $1`,
      [a.id],
    );
    expect(first).toBeDefined();

    await db.admin(`update user_activity set last_active_at = now() - interval '30 seconds' where user_id = $1`, [a.id]);
    const [before] = await db.admin<{ last_active_at: Date }>(`select last_active_at from user_activity where user_id = $1`, [a.id]);
    await db.as(a, `select public.touch_activity()`);
    const [throttled] = await db.admin<{ last_active_at: Date }>(`select last_active_at from user_activity where user_id = $1`, [a.id]);
    expect(throttled!.last_active_at.getTime()).toBe(before!.last_active_at.getTime());

    await db.admin(`update user_activity set last_active_at = now() - interval '2 minutes' where user_id = $1`, [a.id]);
    await db.as(a, `select public.touch_activity()`);
    const [fresh] = await db.admin<{ last_active_at: Date }>(`select last_active_at from user_activity where user_id = $1`, [a.id]);
    expect(Date.now() - fresh!.last_active_at.getTime()).toBeLessThan(10_000);

    await expectDenied(db.as('anon', `select public.touch_activity()`));
  });
});

describe('presence channel reciprocity', () => {
  it('stops reading others’ presence when your own online status is off', async () => {
    const a = await db.createUser('pr_a');
    const b = await db.createUser('pr_b');
    await chat(a, b);
    const topic = `connect:presence:${a.id}`;
    await db.admin(`insert into realtime.messages (topic, payload) values ($1, '{}')`, [topic]);
    const canRead = async () =>
      (await db.asOnTopic(b, topic, `select id from realtime.messages where topic = $1`, [topic])).length > 0;
    expect(await canRead()).toBe(true);
    await showOnline(b, false);
    expect(await canRead()).toBe(false);
    // Your own topic stays readable.
    const own = `connect:presence:${b.id}`;
    await db.admin(`insert into realtime.messages (topic, payload) values ($1, '{}')`, [own]);
    expect((await db.asOnTopic(b, own, `select id from realtime.messages where topic = $1`, [own])).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/db-tests exec vitest run last-seen.test.ts`
Expected: FAIL — `function public.last_seen(uuid[]) does not exist` / `relation "user_activity" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261015000012_last_seen.sql`:

```sql
-- VYBORA Connect: "last seen" (additive).
--
-- Activity lives in its own table with no client grants: only the two
-- functions below touch it, so it never leaks through profiles or devices
-- (see 0010, which hid device last_seen_at for the same reason).
--
-- Rules for last_seen():
--   * the caller shares a chat with the target,
--   * the target shows online status,
--   * the caller shows online status too (reciprocal),
--   * neither has blocked the other,
--   * minute precision, at most 100 ids per call.

create table public.user_activity (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);

alter table public.user_activity enable row level security;
revoke all on table public.user_activity from public, anon, authenticated;

create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.user_activity as ua (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at
    where ua.last_active_at < now() - interval '60 seconds';
end;
$$;

create or replace function public.caller_shows_online()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.show_online from public.user_settings s where s.user_id = auth.uid()),
    false
  );
$$;

create or replace function public.last_seen(p_user_ids uuid[])
returns table (user_id uuid, last_active_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 100 then
    raise exception 'too_many_users' using errcode = '22023';
  end if;
  if not public.caller_shows_online() then
    return;
  end if;
  return query
    select a.user_id, date_trunc('minute', a.last_active_at)
    from public.user_activity a
    join public.user_settings t on t.user_id = a.user_id and t.show_online
    where a.user_id = any (p_user_ids)
      and a.user_id <> auth.uid()
      and public.shares_conversation_with(a.user_id)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = a.user_id)
           or (b.blocker_id = a.user_id and b.blocked_id = auth.uid())
      );
end;
$$;

revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.caller_shows_online() from public, anon;
revoke execute on function public.last_seen(uuid[]) from public, anon;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.caller_shows_online() to authenticated;
grant execute on function public.last_seen(uuid[]) to authenticated;

-- Presence is reciprocal too: you can read others' presence only while your
-- own "show when I'm online" is on. Your own topic stays readable.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "connect: presence read" on realtime.messages';
    execute $p$
      create policy "connect: presence read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'connect:presence:%'
          and (
            public.try_uuid(substr(realtime.topic(), 18)) = auth.uid()
            or (
              public.shares_conversation_with(public.try_uuid(substr(realtime.topic(), 18)))
              and public.caller_shows_online()
            )
          )
        )
    $p$;
  end if;
end;
$$;
```

- [ ] **Step 4: Run DB tests to verify they pass**

Run: `pnpm --filter @vybora/db-tests exec vitest run last-seen.test.ts`
Expected: PASS (8 tests). Then `pnpm test:db` — the full suite (previously 96) passes, including the existing realtime test in `connect.test.ts` (its users keep `show_online = true`).

- [ ] **Step 5: Regenerate DB types**

Run: `pnpm db:types`
Expected: `packages/types/src/database.ts` now contains `touch_activity`, `caller_shows_online` and `last_seen` under `Functions`.

- [ ] **Step 6: Write the failing API test**

`packages/api/src/lastSeen.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchLastSeen, touchActivity } from './connect';
import type { VyboraClient } from './client';

const clientWith = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as VyboraClient;

describe('last seen API', () => {
  it('maps rows by user and caps the request at 100 ids', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ user_id: 'u1', last_active_at: '2026-10-15T10:05:00+00:00' }],
      error: null,
    });
    const ids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    expect(await fetchLastSeen(clientWith(rpc), ids)).toEqual({ u1: '2026-10-15T10:05:00+00:00' });
    expect(rpc).toHaveBeenCalledWith('last_seen', { p_user_ids: ids.slice(0, 100) });
  });

  it('skips the request for an empty list', async () => {
    const rpc = vi.fn();
    expect(await fetchLastSeen(clientWith(rpc), [])).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws RPC errors from touchActivity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(touchActivity(clientWith(rpc))).rejects.toMatchObject({ message: 'offline' });
  });
});
```

Run: `pnpm --filter @vybora/api exec vitest run src/lastSeen.test.ts`
Expected: FAIL — `fetchLastSeen` is not exported.

- [ ] **Step 7: Implement the API**

In `packages/api/src/connect.ts`, after `updateConnectPrivacy`:

```ts
/** Record that I'm active (server time; throttled to once a minute server-side). */
export async function touchActivity(client: VyboraClient): Promise<void> {
  const { error } = await client.rpc('touch_activity');
  if (error) throw error;
}

/** Last-seen times the server allows me to see (reciprocal, shared chats only). */
export async function fetchLastSeen(
  client: VyboraClient,
  userIds: string[],
): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const rows = unwrap(await client.rpc('last_seen', { p_user_ids: userIds.slice(0, 100) }));
  return Object.fromEntries(rows.map((r) => [r.user_id!, r.last_active_at!]));
}
```

In `packages/api/src/keys.ts`, inside `connect: { ... }` add:

```ts
    lastSeen: (userId: string) => ['connect', 'last-seen', userId] as const,
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @vybora/api exec vitest run src/lastSeen.test.ts` → PASS (3 tests).
Run: `pnpm typecheck` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261015000012_last_seen.sql supabase/tests/last-seen.test.ts packages/types/src/database.ts packages/api/src
git commit -m "feat(db,api): reciprocal last seen with server-side privacy rules"
```

---

### Task 6: Web accessibility provider, page, styles and route

**Files:**
- Create: `apps/web/src/features/a11y/A11yProvider.tsx`, `apps/web/src/features/a11y/AccessibilityPage.tsx`
- Test: `apps/web/src/features/a11y/a11y.test.tsx`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/features/settings/SettingsNav.tsx`, `apps/web/src/features/connect/CommandPalette.tsx`, `apps/web/src/styles/index.css`, `apps/web/src/routes/Landing.tsx`, `apps/web/src/routes/landing/motion.ts`, `apps/web/src/test/utils.tsx`

**Interfaces:**
- Consumes: `A11yPrefs`, `DEFAULT_A11Y_PREFS`, `parseA11yPrefs`, `resolveReduceMotion`, `A11Y_STORAGE_KEY`, `highContrastThemes` (Task 4).
- Produces:
  - `A11yProvider({ children })`, `useA11y(): { prefs: A11yPrefs; setPrefs(patch: Partial<A11yPrefs>): void; reduceMotion: boolean }` (falls back to defaults outside the provider)
  - `<html>` attributes: `data-contrast="high|normal"`, `data-text-size="sm|md|lg|xl"`, `data-reduce-motion="true|false"`
  - CSS utilities: `.text-msg` (message text), `.text-msg-sm` (row preview / composer helper), `.touch-target`, `.menu`
  - Route `/settings/accessibility`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/a11y/a11y.test.tsx`:

```tsx
import { A11Y_STORAGE_KEY } from '@vybora/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import AccessibilityPage from './AccessibilityPage';

afterEach(() => localStorage.clear());

describe('Accessibility settings', () => {
  it('applies and saves high contrast, text size and motion on this device', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccessibilityPage />);
    const html = document.documentElement;

    await user.click(screen.getByRole('switch', { name: 'High contrast' }));
    expect(html.dataset.contrast).toBe('high');

    await user.click(screen.getByRole('radio', { name: 'Large' }));
    expect(html.dataset.textSize).toBe('lg');

    await user.click(screen.getByRole('radio', { name: 'On' }));
    expect(html.dataset.reduceMotion).toBe('true');

    expect(JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY)!)).toMatchObject({
      highContrast: true,
      textSize: 'lg',
      reduceMotion: 'on',
    });
  });

  it('restores saved settings on the next visit', () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ textSize: 'xl', alwaysShowActions: true }));
    renderWithProviders(<AccessibilityPage />);
    expect(document.documentElement.dataset.textSize).toBe('xl');
    expect(screen.getByRole('radio', { name: 'Extra large' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Always show message actions' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/web exec vitest run src/features/a11y/a11y.test.tsx`
Expected: FAIL — cannot resolve `./AccessibilityPage`.

- [ ] **Step 3: Implement the provider**

`apps/web/src/features/a11y/A11yProvider.tsx`:

```tsx
import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  parseA11yPrefs,
  resolveReduceMotion,
  type A11yPrefs,
} from '@vybora/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface A11yState {
  prefs: A11yPrefs;
  setPrefs: (patch: Partial<A11yPrefs>) => void;
  /** Setting combined with the system "reduce motion" preference. */
  reduceMotion: boolean;
}

const FALLBACK: A11yState = {
  prefs: DEFAULT_A11Y_PREFS,
  setPrefs: () => undefined,
  reduceMotion: false,
};
const Ctx = createContext<A11yState | null>(null);

/** Defaults outside the provider so isolated component tests keep working. */
export const useA11y = () => useContext(Ctx) ?? FALLBACK;

function read(): A11yPrefs {
  try {
    return parseA11yPrefs(localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

const systemReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Per-device accessibility settings, applied as attributes on <html>. */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<A11yPrefs>(read);
  const [system, setSystem] = useState(systemReduced);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const reduceMotion = resolveReduceMotion(prefs.reduceMotion, system);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
    html.dataset.textSize = prefs.textSize;
    html.dataset.reduceMotion = String(reduceMotion);
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: settings last for this visit */
    }
  }, [prefs, reduceMotion]);

  const setPrefs = useCallback(
    (patch: Partial<A11yPrefs>) => setState((prev) => ({ ...prev, ...patch })),
    [],
  );
  const value = useMemo(() => ({ prefs, setPrefs, reduceMotion }), [prefs, setPrefs, reduceMotion]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Implement the page**

`apps/web/src/features/a11y/AccessibilityPage.tsx`:

```tsx
import {
  ArrowBendUpLeftIcon,
  CircleHalfIcon,
  CursorClickIcon,
  WaveformIcon,
} from '@phosphor-icons/react';
import type { ReduceMotionPref, TextSize } from '@vybora/core';
import { Toggle } from '@/components/ui/Field';
import { Row, Section } from '@/features/connect/ui';
import { SettingsPage } from '@/features/settings/SettingsNav';
import { cn } from '@/lib/cn';
import { useA11y } from './A11yProvider';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid overflow-hidden rounded-md border border-line-strong"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'touch-target flex h-10 items-center justify-center px-2 text-sm font-medium transition-colors duration-150',
            i > 0 && 'border-l border-line-strong',
            value === o.value ? 'bg-accent text-on-accent' : 'hover:bg-surface-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MOTION: { value: ReduceMotionPref; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];
const SIZES: { value: TextSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Default' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

export default function AccessibilityPage() {
  const { prefs, setPrefs } = useA11y();
  return (
    <SettingsPage title="Accessibility">
      <Section title="Motion & gestures" footer="Saved on this device only.">
        <div className="space-y-2 px-4 py-3">
          <p className="flex items-center gap-3 text-sm font-medium">
            <WaveformIcon size={18} className="text-muted" aria-hidden="true" /> Reduce motion
          </p>
          <Segmented
            label="Reduce motion"
            value={prefs.reduceMotion}
            options={MOTION}
            onChange={(reduceMotion) => setPrefs({ reduceMotion })}
          />
        </div>
        <Row
          icon={<ArrowBendUpLeftIcon size={18} />}
          label="Swipe to reply"
          description="On touch screens, drag a message right to reply. Reply is always in the message menu."
          right={
            <Toggle
              label="Swipe to reply"
              checked={prefs.swipeToReply}
              onChange={(swipeToReply) => setPrefs({ swipeToReply })}
            />
          }
        />
      </Section>

      <Section title="Text">
        <div className="space-y-3 px-4 py-3">
          <Segmented
            label="Message text size"
            value={prefs.textSize}
            options={SIZES}
            onChange={(textSize) => setPrefs({ textSize })}
          />
          <p className="text-msg rounded-lg rounded-bl-sm border border-line bg-bubble-in px-3 py-2">
            This is how messages will look.
          </p>
        </div>
      </Section>

      <Section title="Display">
        <Row
          icon={<CircleHalfIcon size={18} />}
          label="High contrast"
          description="Stronger text and borders in light and dark themes. Links are underlined."
          right={
            <Toggle
              label="High contrast"
              checked={prefs.highContrast}
              onChange={(highContrast) => setPrefs({ highContrast })}
            />
          }
        />
        <Row
          icon={<CursorClickIcon size={18} />}
          label="Always show message actions"
          description="Reply, react and more stay visible instead of appearing on hover."
          right={
            <Toggle
              label="Always show message actions"
              checked={prefs.alwaysShowActions}
              onChange={(alwaysShowActions) => setPrefs({ alwaysShowActions })}
            />
          }
        />
      </Section>
    </SettingsPage>
  );
}
```

- [ ] **Step 5: Wire provider, route, nav, palette, test utils**

`apps/web/src/app/App.tsx` — wrap inside `ToastProvider`:

```tsx
import { A11yProvider } from '@/features/a11y/A11yProvider';
// …
      <ToastProvider>
        <A11yProvider>
          <TooltipProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </TooltipProvider>
        </A11yProvider>
      </ToastProvider>
```

`apps/web/src/app/router.tsx` — add the lazy import and route:

```tsx
const AccessibilitySettings = lazy(() => import('@/features/a11y/AccessibilityPage'));
// inside settings children, after privacy:
                  { path: 'accessibility', element: <AccessibilitySettings /> },
```

`apps/web/src/features/settings/SettingsNav.tsx` — import `EyeIcon` and insert after Privacy & security in `SECTIONS`:

```tsx
  {
    to: '/settings/accessibility',
    label: 'Accessibility',
    description: 'Motion, text size, contrast, gestures',
    icon: <EyeIcon size={20} />,
  },
```

`apps/web/src/features/connect/CommandPalette.tsx` — import `EyeIcon`; add after the Settings item:

```tsx
          <Item
            value="accessibility text size contrast motion"
            icon={<EyeIcon size={18} />}
            onSelect={() => run(() => navigate('/settings/accessibility'))}
          >
            Accessibility
          </Item>
```

`apps/web/src/test/utils.tsx` — wrap with the provider:

```tsx
import { A11yProvider } from '@/features/a11y/A11yProvider';
// …
        <ToastProvider>
          <A11yProvider>
            <TooltipProvider>
              <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
            </TooltipProvider>
          </A11yProvider>
        </ToastProvider>
```

- [ ] **Step 6: Styles — high contrast, text size, reduce motion, utilities**

In `apps/web/src/styles/index.css`, after the `[data-theme='dark'] { … }` block add:

```css
/* Accessibility → High contrast (values mirror highContrastThemes in packages/config). */
:root[data-contrast='high'] {
  --vy-bg: #ffffff;
  --vy-surface: #ffffff;
  --vy-surface-muted: #f1f5f5;
  --vy-surface-strong: #e2eaea;
  --vy-border: #5f7173;
  --vy-border-strong: #2e3d41;
  --vy-text: #0b1416;
  --vy-text-muted: #2e3d41;
  --vy-text-subtle: #3e4f52;
  --vy-accent: #115e59;
  --vy-accent-hover: #0f4c47;
  --vy-accent-soft: #cdedea;
  --vy-on-accent: #ffffff;
  --vy-bubble-in: #e2eaea;
  --vy-danger: #8f1b12;
  --vy-success: #065f46;
  --vy-warning: #7c3a06;
}
:root[data-theme='dark'][data-contrast='high'] {
  --vy-bg: #000000;
  --vy-surface: #0a0e0f;
  --vy-surface-muted: #151d1f;
  --vy-surface-strong: #1f2a2d;
  --vy-border: #75898b;
  --vy-border-strong: #9aacad;
  --vy-text: #ffffff;
  --vy-text-muted: #c9d6d6;
  --vy-text-subtle: #afc0c1;
  --vy-accent: #5eead4;
  --vy-accent-hover: #99f6e4;
  --vy-accent-soft: #0e2b2a;
  --vy-on-accent: #04201d;
  --vy-bubble-in: #1f2a2d;
  --vy-danger: #fca5a5;
  --vy-success: #6ee7b7;
  --vy-warning: #fcd34d;
}
:root[data-contrast='high'] a {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Accessibility → Text size (message text, chat rows, composer). */
:root {
  --vy-msg-size: 15px;
}
:root[data-text-size='sm'] {
  --vy-msg-size: 13px;
}
:root[data-text-size='lg'] {
  --vy-msg-size: 17px;
}
:root[data-text-size='xl'] {
  --vy-msg-size: 20px;
}
```

In `@layer utilities { … }` add:

```css
  .text-msg {
    font-size: var(--vy-msg-size);
    line-height: 1.45;
  }
  .text-msg-sm {
    font-size: calc(var(--vy-msg-size) - 2px);
    line-height: 1.4;
  }
  @media (pointer: coarse) {
    .touch-target {
      min-width: 44px;
      min-height: 44px;
    }
  }
```

After the tooltip keyframes add:

```css
.menu[data-state='open'] {
  animation: tip-in 120ms ease-out;
}
```

Replace the final `@media (prefers-reduced-motion: reduce) { … }` block with:

```css
/* Reduced motion: the system setting unless overridden in Accessibility (data-reduce-motion). */
@media (prefers-reduced-motion: reduce) {
  :root:not([data-reduce-motion='false']) *,
  :root:not([data-reduce-motion='false']) *::before,
  :root:not([data-reduce-motion='false']) *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
:root[data-reduce-motion='true'] *,
:root[data-reduce-motion='true'] *::before,
:root[data-reduce-motion='true'] *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
```

- [ ] **Step 7: Landing follows the setting**

`apps/web/src/routes/landing/motion.ts` — replace `prefersReducedMotion` and make `useSmoothScroll` take a flag:

```ts
const prefersReducedMotion = () => {
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.reduceMotion : undefined;
  if (attr) return attr === 'true';
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/** Smooth scrolling for the marketing page only; off with reduced motion. */
export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: true, anchors: { offset: -88 } });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [enabled]);
}
```

`apps/web/src/routes/Landing.tsx`:

```tsx
import { useA11y } from '@/features/a11y/A11yProvider';
// …
export default function Landing() {
  const { reduceMotion } = useA11y();
  useSmoothScroll(!reduceMotion);
  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/a11y/a11y.test.tsx` → PASS (2 tests).
Run: `pnpm --filter @vybora/web test` → all web tests pass.
Run: `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): Settings → Accessibility (motion, text size, contrast, actions)"
```

---

### Task 7: Web conversation layout (runs, tails, date chips, unread divider)

**Files:**
- Create: `apps/web/src/features/connect/ThreadParts.tsx`
- Modify: `apps/web/src/features/connect/Bubble.tsx`, `apps/web/src/features/connect/ChatPane.tsx`
- Test: `apps/web/src/features/connect/thread.test.tsx`

**Interfaces:**
- Consumes: `layoutThread`, `ThreadItem`, `receiptOf`, `messageSummary`, `formatClock`, `formatUnread`, `Receipt` (Tasks 1–3); `useA11y` (Task 6).
- Produces:
  - `DateChip({ label }: { label: string })`, `UnreadDivider({ count }: { count: number })`, `JumpToLatest({ count, onClick }: { count: number; onClick: () => void })` (used in Task 8)
  - `Bubble` new props: `runStart: boolean; runEnd: boolean; avatar?: { path: string | null; name: string }; tabbable?: boolean`; `Ticks` and `Receipt` re-exported from `Bubble.tsx` (`export type { Receipt } from '@vybora/core'`, `export function Ticks`)
  - Bubble root: `role="article"`, `aria-label="<sender>, <time>, <summary>[, <receipt>]"`, `data-message-id`, tail `svg[data-tail="true"]` when `runEnd`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/connect/thread.test.tsx`:

```tsx
import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { DateChip, JumpToLatest, UnreadDivider } from './ThreadParts';
import { useChatTheme } from './ui';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const msg: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: 'maya',
  senderDeviceId: 'd1',
  createdAt: '2026-10-15T14:05:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'See you at 7',
  reactions: {},
};

function Harness(props: Partial<Parameters<typeof Bubble>[0]>) {
  const theme = useChatTheme(resolveChatTheme({}));
  return (
    <TooltipProvider>
      <Bubble
        message={msg}
        mine={false}
        theme={theme}
        showSender={false}
        runStart
        runEnd
        myUserId="me"
        nameOf={(id) => (id === 'maya' ? 'Maya' : 'You')}
        onReact={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        onOpenImage={vi.fn()}
        onSelect={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe('conversation layout', () => {
  it('reads each message as one item and draws a tail on the run end', () => {
    const { container } = render(<Harness />);
    const item = screen.getByRole('article');
    expect(item.getAttribute('aria-label')).toMatch(/^Maya, .+, See you at 7$/);
    expect(container.querySelector('[data-tail="true"]')).not.toBeNull();
  });

  it('omits the tail inside a run', () => {
    const { container } = render(<Harness runEnd={false} />);
    expect(container.querySelector('[data-tail="true"]')).toBeNull();
  });

  it('announces receipts on my messages', () => {
    render(<Harness message={{ ...msg, senderId: 'me', status: 'sent' }} mine receipt="read" />);
    expect(screen.getByRole('article').getAttribute('aria-label')).toMatch(/, read$/);
  });

  it('renders date chips and the unread divider as headings', () => {
    render(
      <>
        <DateChip label="Today" />
        <UnreadDivider count={3} />
        <JumpToLatest count={3} onClick={vi.fn()} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 unread messages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to latest message, 3 new' })).toBeInTheDocument();
  });
});
```

(Check `useChatTheme`'s import path/signature in `features/connect/ui.tsx`; `connect.test.tsx` already builds a theme the same way — copy its construction if it differs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/thread.test.tsx`
Expected: FAIL — cannot resolve `./ThreadParts`.

- [ ] **Step 3: Create `ThreadParts.tsx`**

```tsx
import { ArrowDownIcon } from '@phosphor-icons/react';
import { formatUnread } from '@vybora/core';

/** Day separator; sticks to the top of the thread while its day is on screen. */
export function DateChip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none sticky top-2 z-10 my-3 flex justify-center">
      <h2 className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
        {label}
      </h2>
    </div>
  );
}

export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className="my-3 flex items-center gap-3 px-3 md:px-6" data-unread-divider>
      <span className="h-px flex-1 bg-accent" aria-hidden="true" />
      <h2 className="font-mono text-[11px] font-medium text-accent">
        {count === 1 ? '1 unread message' : `${count} unread messages`}
      </h2>
      <span className="h-px flex-1 bg-accent" aria-hidden="true" />
    </div>
  );
}

export function JumpToLatest({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      className="touch-target absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-surface text-ink transition-colors duration-150 hover:bg-surface-muted md:right-6"
    >
      <ArrowDownIcon size={18} aria-hidden="true" />
      {count > 0 && (
        <span
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-sm bg-accent px-1 font-mono text-[11px] font-medium text-on-accent"
          aria-hidden="true"
        >
          {formatUnread(count)}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Update `Bubble.tsx`**

1. Imports: add `import { formatClock, messageSummary, type Receipt } from '@vybora/core';` and `import { Avatar } from '@/components/ui/Avatar';`. Replace `export type Receipt = …` with `export type { Receipt } from '@vybora/core';`. Change `function Ticks` to `export function Ticks`.
2. Add the tail component above `ActionButton`:

```tsx
const RECEIPT_LABEL: Record<Receipt, string> = {
  sending: 'sending',
  failed: 'not sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
};

/** Flat notch on the last bubble of a run, in the bubble's own colour. */
function Tail({ mine, fill }: { mine: boolean; fill?: string }) {
  return (
    <svg
      width="8"
      height="10"
      viewBox="0 0 8 10"
      aria-hidden="true"
      data-tail="true"
      className={cn('absolute bottom-0', mine ? '-right-[7px]' : '-left-[7px] -scale-x-100')}
    >
      <path d="M0 0C0.5 6 3.5 9 8 10H0Z" fill={fill ?? 'var(--vy-bubble-in)'} />
      {!fill && (
        <path d="M0 0C0.5 6 3.5 9 8 10H0" fill="none" stroke="var(--vy-border)" strokeWidth="1" />
      )}
    </svg>
  );
}
```

3. `BubbleProps` additions:

```ts
  runStart: boolean;
  runEnd: boolean;
  /** Group chats, incoming only: shown beside the last bubble of a run. */
  avatar?: { path: string | null; name: string };
  /** The newest message is the thread's single Tab stop. */
  tabbable?: boolean;
  onSelect: (m: LocalMessage) => void;
```

(`onSelect` is wired into the menu in Task 9; accept and ignore it here.)

4. In the component, destructure the new props and compute the label:

```tsx
  const senderLabel = mine ? 'You' : nameOf(m.senderId);
  const label = [senderLabel, formatClock(m.createdAt), messageSummary(m), receipt ? RECEIPT_LABEL[receipt] : null]
    .filter(Boolean)
    .join(', ');
```

5. Replace the outer wrapper and bubble classes:

```tsx
    <div
      className={cn(
        'group flex flex-col px-3 md:px-6',
        runStart ? 'pt-2' : 'pt-0.5',
        mine ? 'items-end' : 'items-start',
      )}
      data-message-id={m.id}
      tabIndex={tabbable ? 0 : -1}
      role="article"
      aria-label={label}
    >
      {showSender && !mine && senderName && (
        <span className={cn('mb-0.5 text-xs font-semibold', avatar ? 'ml-10' : 'ml-1')} style={{ color: theme.accent }}>
          {senderName}
        </span>
      )}
      <div className={cn('flex max-w-full items-end gap-2', mine && 'flex-row-reverse')}>
        {avatar && !mine &&
          (runEnd ? (
            <Avatar path={avatar.path} name={avatar.name} size={28} />
          ) : (
            <span className="w-7 shrink-0" aria-hidden="true" />
          ))}
        <div className={cn('relative flex max-w-[min(80%,600px)] items-center gap-1', mine && 'flex-row-reverse')}>
          <div
            className={cn(
              'relative min-w-0 rounded-lg',
              media ? 'p-1' : 'px-3 py-2',
              runEnd && (mine ? 'rounded-br-sm' : 'rounded-bl-sm'),
              !filled && 'border border-line bg-bubble-in text-ink',
            )}
            style={filled ? { background: theme.bubble, color: theme.bubbleText } : undefined}
          >
            {/* …existing reply quote, content and meta row unchanged… */}
            {runEnd && <Tail mine={mine} fill={filled ? theme.bubble : undefined} />}
          </div>
          {/* …existing actions bar and reaction picker unchanged… */}
        </div>
      </div>
      {/* …existing reactions row and retry button unchanged… */}
    </div>
```

6. In the text content and caption `<p>`s, replace `text-[15px] leading-[1.45]` with `text-msg`.

- [ ] **Step 5: Use `layoutThread` in `ChatPane.tsx`**

1. Imports: add `import { layoutThread, receiptOf } from '@vybora/core';` and `import { DateChip, UnreadDivider } from './ThreadParts';`. Remove the local `dayLabel` helper and `receiptFor` function.
2. Freeze the read position when a chat opens (after the `ordered` memo):

```tsx
  // The unread divider uses the read position from when the chat was opened,
  // so it doesn't vanish the moment this tab acknowledges the messages.
  const [readMark, setReadMark] = useState<{ id: string; seq: number } | null>(null);
  useEffect(() => {
    if (conv && readMark?.id !== id) setReadMark({ id, seq: conv.lastReadSeq });
  }, [conv, id, readMark?.id]);

  const items = useMemo(
    () =>
      layoutThread(ordered, {
        myUserId: userId,
        lastReadSeq: readMark?.id === id ? readMark.seq : Number.MAX_SAFE_INTEGER,
        now: new Date(),
      }),
    [ordered, userId, readMark, id],
  );
  const newestId = ordered.at(-1)?.id;
```

3. Replace the `{ordered.map((m, i) => { … })}` block with:

```tsx
          {items.map((it) => {
            if (it.type === 'date') return <DateChip key={it.key} label={it.label} />;
            if (it.type === 'unread') return <UnreadDivider key={it.key} count={it.count} />;
            const m = it.message;
            const group = conv?.kind === 'group';
            const sender = conv?.members.find((x) => x.id === m.senderId);
            return (
              <Bubble
                key={it.key}
                message={m}
                mine={it.mine}
                theme={def}
                senderName={group ? nameOf(m.senderId) : undefined}
                showSender={!!group && it.runStart}
                runStart={it.runStart}
                runEnd={it.runEnd}
                avatar={
                  group && !it.mine
                    ? { path: sender?.avatar_path ?? null, name: sender?.username ?? '?' }
                    : undefined
                }
                tabbable={m.id === newestId}
                receipt={receiptOf(m, userId, conv?.members ?? [])}
                myUserId={userId}
                nameOf={nameOf}
                onReact={(msg, emoji) =>
                  void run(() =>
                    engine!.send(id, {
                      t: 'reaction',
                      target: msg.id,
                      emoji,
                      remove: !!msg.reactions[emoji]?.includes(userId),
                    }),
                  )
                }
                onReply={(msg) => {
                  setReplyTo(msg);
                  composer.current?.focus();
                }}
                onDelete={setDeleting}
                onRetry={(msg) => void run(() => engine!.retry(id, msg.id))}
                onOpenImage={setViewer}
                onJumpTo={jumpTo}
                onSelect={() => undefined}
              />
            );
          })}
```

4. Scroll to the unread divider once per chat (place after the existing pin-to-bottom `useLayoutEffect`):

```tsx
  const positioned = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (positioned.current === id || readMark?.id !== id || !ordered.length) return;
    positioned.current = id;
    const divider = scroller.current?.querySelector<HTMLElement>('[data-unread-divider]');
    if (divider) {
      divider.scrollIntoView({ block: 'start' });
      stick.current = false;
    }
  }, [id, readMark, ordered.length]);
```

5. Update the existing Bubble tests in `connect.test.tsx`: add `runStart`, `runEnd` and `onSelect={vi.fn()}` to its `renderBubble` props.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect` → PASS (thread + connect tests).
Run: `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/connect
git commit -m "feat(web): message runs with tails, sticky date chips and unread divider"
```

---

### Task 8: Web jump-to-latest, new-message announcements, keyboard navigation

**Files:**
- Create: `apps/web/src/features/connect/announce.ts`, `apps/web/src/features/connect/threadKeys.ts`
- Modify: `apps/web/src/features/connect/ChatPane.tsx`
- Test: `apps/web/src/features/connect/thread.test.tsx` (extend)

**Interfaces:**
- Consumes: `JumpToLatest` (Task 7), `messageSummary`, `messageActions` (Task 3), `useA11y` (Task 6).
- Produces:
  - `useIncomingAnnouncement(messages: readonly LocalMessage[], opts: { ready: boolean; userId: string; muted: boolean; conversationId: string; nameOf: (id: string) => string }): string`
  - `threadKeyDown(e: React.KeyboardEvent<HTMLElement>, handlers: { onReply: (id: string) => void; onToggle?: (id: string) => void }): void`

- [ ] **Step 1: Write the failing tests** (append to `thread.test.tsx`)

```tsx
import { act, fireEvent, renderHook } from '@testing-library/react';
import { useIncomingAnnouncement } from './announce';
import { threadKeyDown } from './threadKeys';

describe('new-message announcements', () => {
  const nameOf = (id: string) => (id === 'maya' ? 'Maya' : 'You');
  const base = { ready: true, userId: 'me', muted: false, conversationId: 'c1', nameOf };

  it('announces only messages that arrive after the chat loaded', () => {
    const first = { ...msg, id: 'a' };
    const { result, rerender } = renderHook((p: { list: LocalMessage[] }) => useIncomingAnnouncement(p.list, base), {
      initialProps: { list: [first] },
    });
    expect(result.current).toBe('');
    rerender({ list: [first, { ...msg, id: 'b', body: 'hello' }] });
    expect(result.current).toBe('Maya: hello');
  });

  it('stays quiet in muted chats and for my own messages', () => {
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[]; muted: boolean }) => useIncomingAnnouncement(p.list, { ...base, muted: p.muted }),
      { initialProps: { list: [{ ...msg, id: 'a' }], muted: true } },
    );
    rerender({ list: [{ ...msg, id: 'a' }, { ...msg, id: 'b' }], muted: true });
    expect(result.current).toBe('');
    rerender({ list: [{ ...msg, id: 'a' }, { ...msg, id: 'b' }, { ...msg, id: 'c', senderId: 'me' }], muted: false });
    expect(result.current).toBe('');
  });
});

describe('thread keyboard', () => {
  function setup() {
    const onReply = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      <div onKeyDown={(e) => threadKeyDown(e, { onReply, onToggle })}>
        {['a', 'b', 'c'].map((id) => (
          <div key={id} data-message-id={id} tabIndex={-1}>
            {id}
          </div>
        ))}
      </div>,
    );
    const rows = [...container.querySelectorAll<HTMLElement>('[data-message-id]')];
    return { rows, onReply, onToggle };
  }

  it('moves between messages with arrow keys', () => {
    const { rows } = setup();
    act(() => rows[1]!.focus());
    fireEvent.keyDown(rows[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
  });

  it('replies with R and toggles selection with Space', () => {
    const { rows, onReply, onToggle } = setup();
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: 'r' });
    expect(onReply).toHaveBeenCalledWith('a');
    fireEvent.keyDown(rows[0]!, { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('opens the message menu with Enter', () => {
    const { rows } = setup();
    const onMenu = vi.fn();
    rows[0]!.addEventListener('contextmenu', onMenu);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: 'Enter' });
    expect(onMenu).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/thread.test.tsx`
Expected: FAIL — cannot resolve `./announce` / `./threadKeys`.

- [ ] **Step 3: Implement `announce.ts`**

```ts
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
```

- [ ] **Step 4: Implement `threadKeys.ts`**

```ts
import type { KeyboardEvent } from 'react';

/**
 * Keyboard model for the message list (focus lives on [data-message-id]
 * elements): ↑/↓ move, Enter opens the message menu, R replies, Space toggles
 * selection in select mode. Shift+F10 / the Menu key fire `contextmenu` natively.
 */
export function threadKeyDown(
  e: KeyboardEvent<HTMLElement>,
  handlers: { onReply: (id: string) => void; onToggle?: (id: string) => void },
) {
  const target = e.target as HTMLElement;
  const current = target.closest<HTMLElement>('[data-message-id]');
  if (!current || target !== current) return;
  const id = current.dataset.messageId!;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-message-id]')];
    const next = all[all.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const r = current.getBoundingClientRect();
    current.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 24, clientY: r.top + 12 }),
    );
  } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    handlers.onReply(id);
  } else if (e.key === ' ' && handlers.onToggle) {
    e.preventDefault();
    handlers.onToggle(id);
  }
}
```

- [ ] **Step 5: Wire into `ChatPane.tsx`**

1. Imports: `import { messageActions } from '@vybora/core';`, `import { isMuted } from '@vybora/api';` (add to the existing `@vybora/api` import), `import { useA11y } from '@/features/a11y/A11yProvider';`, `import { useIncomingAnnouncement } from './announce';`, `import { threadKeyDown } from './threadKeys';`, and add `JumpToLatest` to the `./ThreadParts` import.
2. State and effects (after the `items` memo):

```tsx
  const { reduceMotion } = useA11y();
  const [away, setAway] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const lastSeenSeq = useRef(0);
  useEffect(() => {
    lastSeenSeq.current = 0;
    setNewCount(0);
    setAway(false);
  }, [id]);
  useEffect(() => {
    const newest = ordered.at(-1)?.seq ?? 0;
    if (stick.current || !lastSeenSeq.current) {
      setNewCount(0);
      lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
      return;
    }
    const fresh = ordered.filter((m) => (m.seq ?? 0) > lastSeenSeq.current && m.senderId !== userId).length;
    if (fresh) setNewCount((c) => c + fresh);
    lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
  }, [ordered, userId]);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    setNewCount(0);
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const announcement = useIncomingAnnouncement(ordered, {
    ready: !!messages.isSuccess,
    userId,
    muted: conv ? isMuted(conv) || !conv.notificationsEnabled : true,
    conversationId: id,
    nameOf,
  });

  const replyById = (mid: string) => {
    const m = ordered.find((x) => x.id === mid);
    if (m && messageActions(m, m.senderId === userId).includes('reply')) {
      setReplyTo(m);
      composer.current?.focus();
    }
  };
```

3. Wrap the scroller in a positioned container, extend `onScroll`, add `onKeyDown`, the live region and the button:

```tsx
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scroller}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto py-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
              stick.current = distance < 80;
              setAway(distance > el.clientHeight);
              if (stick.current) setNewCount(0);
            }}
            onKeyDown={(e) => threadKeyDown(e, { onReply: replyById })}
            role="log"
            aria-label={`Messages with ${title}`}
          >
            {/* …existing content… */}
          </div>
          {away && <JumpToLatest count={newCount} onClick={jumpToLatest} />}
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
```

(The scroller keeps `role="log"`; the live region is separate so history loads are not read aloud.)

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/thread.test.tsx` → PASS.
Run: `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/connect
git commit -m "feat(web): jump to latest, new-message announcements, keyboard navigation"
```

---

### Task 9: Web message menu, swipe-to-reply, always-visible actions

**Files:**
- Create: `apps/web/src/features/connect/MessageMenu.tsx`, `apps/web/src/features/connect/useSwipeReply.ts`
- Modify: `apps/web/src/features/connect/Bubble.tsx`, `apps/web/src/features/connect/ChatPane.tsx`, `apps/web/src/test/setup.ts`, `apps/web/package.json`
- Test: `apps/web/src/features/connect/menu.test.tsx`

**Interfaces:**
- Consumes: `messageActions`, `MessageAction`, `swipeReplyDecision`, `SWIPE_REPLY_THRESHOLD` (Task 3); `useA11y` (Task 6); `QUICK_REACTIONS` (existing in `Bubble.tsx`).
- Produces:
  - `MessageMenu({ children, actions, myReactions, onReact, onAction }: { children: ReactElement; actions: MessageAction[]; myReactions: string[]; onReact: (emoji: string) => void; onAction: (a: MessageAction) => void })`
  - `useSwipeReply(onTrigger: () => void, enabled: boolean): { handlers: Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>; offset: number }`
  - `Bubble` calls `onSelect(m)` from the menu's "Select".

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @vybora/web add --save-exact @radix-ui/react-context-menu@2.2.16`
Expected: added to `apps/web/package.json` dependencies (lockfile updated, no other upgrades).

- [ ] **Step 2: jsdom polyfills for Radix menus**

Append to `apps/web/src/test/setup.ts`:

```ts
// Radix menus measure and capture pointers; jsdom lacks these APIs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.setPointerCapture ??= () => undefined;
```

- [ ] **Step 3: Write the failing test**

`apps/web/src/features/connect/menu.test.tsx`:

```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MessageMenu } from './MessageMenu';
import { useSwipeReply } from './useSwipeReply';

describe('message menu', () => {
  it('opens on right-click with reactions and the allowed actions', async () => {
    const onAction = vi.fn();
    const onReact = vi.fn();
    render(
      <MessageMenu actions={['reply', 'copy', 'select', 'delete']} myReactions={['👍']} onReact={onReact} onAction={onAction}>
        <div>Bubble</div>
      </MessageMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Bubble'));
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete for everyone' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove 👍' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Select' }));
    expect(onAction).toHaveBeenCalledWith('select');
  });

  it('renders the plain bubble when no actions are allowed', () => {
    render(
      <MessageMenu actions={[]} myReactions={[]} onReact={vi.fn()} onAction={vi.fn()}>
        <div>Sending</div>
      </MessageMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Sending'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('swipe to reply (touch)', () => {
  const ev = (x: number, y: number, t: number, pointerType = 'touch') =>
    ({ pointerType, clientX: x, clientY: y, timeStamp: t }) as unknown as PointerEvent<HTMLElement>;

  it('triggers after a 64px rightward drag', () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useSwipeReply(onTrigger, true));
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerMove!(ev(80, 4, 200)));
    expect(result.current.offset).toBeGreaterThan(0);
    act(() => result.current.handlers.onPointerUp!(ev(80, 4, 400)));
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(result.current.offset).toBe(0);
  });

  it('ignores mouse input, vertical drags and the disabled setting', () => {
    const onTrigger = vi.fn();
    const { result, rerender } = renderHook((p: { on: boolean }) => useSwipeReply(onTrigger, p.on), {
      initialProps: { on: true },
    });
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0, 'mouse')));
    act(() => result.current.handlers.onPointerUp!(ev(90, 0, 100, 'mouse')));
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerUp!(ev(70, 120, 100)));
    rerender({ on: false });
    act(() => result.current.handlers.onPointerDown?.(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerUp?.(ev(90, 0, 100)));
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/menu.test.tsx`
Expected: FAIL — cannot resolve `./MessageMenu`.

- [ ] **Step 5: Implement `MessageMenu.tsx`**

```tsx
import { ArrowBendUpLeftIcon, CheckSquareIcon, CopyIcon, TrashIcon } from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { MessageAction } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { QUICK_REACTIONS } from './Bubble';

const LABEL: Record<MessageAction, string> = {
  reply: 'Reply',
  copy: 'Copy text',
  select: 'Select',
  delete: 'Delete for everyone',
};
const ICON: Record<MessageAction, ReactNode> = {
  reply: <ArrowBendUpLeftIcon size={16} aria-hidden="true" />,
  copy: <CopyIcon size={16} aria-hidden="true" />,
  select: <CheckSquareIcon size={16} aria-hidden="true" />,
  delete: <TrashIcon size={16} aria-hidden="true" />,
};

/** Right-click, long-press (touch), Shift+F10 or Enter: reactions on top, then actions. */
export function MessageMenu({
  children,
  actions,
  myReactions,
  onReact,
  onAction,
}: {
  children: ReactElement;
  actions: MessageAction[];
  myReactions: string[];
  onReact: (emoji: string) => void;
  onAction: (a: MessageAction) => void;
}) {
  if (!actions.length) return children;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionPadding={8}
          className="menu z-50 min-w-52 rounded-md border border-line-strong bg-surface p-1"
        >
          <ContextMenu.Group aria-label="Reactions" className="flex gap-0.5 border-b border-line p-1">
            {QUICK_REACTIONS.map((emoji) => {
              const on = myReactions.includes(emoji);
              return (
                <ContextMenu.Item
                  key={emoji}
                  onSelect={() => onReact(emoji)}
                  aria-label={`${on ? 'Remove' : 'React with'} ${emoji}`}
                  className={cn(
                    'touch-target flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-lg outline-none data-[highlighted]:bg-surface-muted',
                    on && 'bg-accent-soft',
                  )}
                >
                  {emoji}
                </ContextMenu.Item>
              );
            })}
          </ContextMenu.Group>
          {actions.map((a) => (
            <ContextMenu.Item
              key={a}
              onSelect={() => onAction(a)}
              className={cn(
                'touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted',
                a === 'delete' && 'text-danger data-[highlighted]:bg-danger-soft',
              )}
            >
              {ICON[a]}
              {LABEL[a]}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
```

- [ ] **Step 6: Implement `useSwipeReply.ts`**

```ts
import { SWIPE_REPLY_THRESHOLD, swipeReplyDecision } from '@vybora/core';
import { useRef, useState, type HTMLAttributes, type PointerEvent } from 'react';

const MAX_OFFSET = 96;

/** Touch-only swipe-to-reply; mouse users keep the hover buttons and the menu. */
export function useSwipeReply(onTrigger: () => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [offset, setOffset] = useState(0);

  const end = (e: PointerEvent<HTMLElement>, released: boolean) => {
    const s = start.current;
    start.current = null;
    setOffset(0);
    if (!s || !released) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const vx = (dx / Math.max(1, e.timeStamp - s.t)) * 1000;
    if (swipeReplyDecision({ dx, dy, vx, released: true }) === 'trigger') onTrigger();
  };

  const handlers: Pick<
    HTMLAttributes<HTMLElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > = enabled
    ? {
        onPointerDown: (e) => {
          if (e.pointerType !== 'touch') return;
          start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        },
        onPointerMove: (e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
            start.current = null;
            setOffset(0);
            return;
          }
          setOffset(Math.max(0, Math.min(dx, MAX_OFFSET)));
        },
        onPointerUp: (e) => end(e, true),
        onPointerCancel: (e) => end(e, false),
      }
    : {};

  return { handlers, offset, armed: offset >= SWIPE_REPLY_THRESHOLD };
}
```

- [ ] **Step 7: Use them in `Bubble.tsx`**

1. Imports: `import { messageActions, SWIPE_REPLY_THRESHOLD } from '@vybora/core';`, `import { DotsThreeIcon } from '@phosphor-icons/react';` (add to the existing Phosphor import), `import { useRef } from 'react';` (merge), `import { useA11y } from '@/features/a11y/A11yProvider';`, `import { MessageMenu } from './MessageMenu';`, `import { useSwipeReply } from './useSwipeReply';`.
2. Inside the component:

```tsx
  const { prefs, reduceMotion } = useA11y();
  const root = useRef<HTMLDivElement>(null);
  const actions = messageActions(m, mine);
  const swipe = useSwipeReply(() => onReply(m), prefs.swipeToReply && actions.includes('reply'));
  const myReactions = Object.entries(m.reactions)
    .filter(([, users]) => users.includes(myUserId))
    .map(([e]) => e);
  const openMenu = () => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 24, clientY: r.top + 12 }));
  };
  const onAction = (a: MessageAction) => {
    if (a === 'reply') onReply(m);
    else if (a === 'copy') void navigator.clipboard?.writeText(m.body ?? '');
    else if (a === 'select') onSelect(m);
    else if (a === 'delete') onDelete(m);
  };
```

(import `type MessageAction` from `@vybora/core`.)

3. Wrap the root `<div …>` from Task 7 in `<MessageMenu actions={actions} myReactions={myReactions} onReact={(e) => onReact(m, e)} onAction={onAction}>…</MessageMenu>`; add `ref={root}`, `{...swipe.handlers}` and `style={{ touchAction: 'pan-y' }}` to that root div.
4. Translate the bubble row and show the reply arrow while swiping — on the `<div className={cn('flex max-w-full items-end gap-2', …)}>` row:

```tsx
      <div
        className={cn('relative flex max-w-full items-end gap-2', mine && 'flex-row-reverse')}
        style={{
          transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
          transition: swipe.offset || reduceMotion ? 'none' : 'transform 180ms ease-out',
        }}
      >
        {swipe.offset > 0 && (
          <span
            className="absolute -left-8 top-1/2 -translate-y-1/2 text-muted"
            style={{ opacity: Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD) }}
            aria-hidden="true"
          >
            <ArrowBendUpLeftIcon size={18} />
          </span>
        )}
```

5. Hover actions bar: make it visible when the setting is on, add **More**, and give buttons the touch target class:

```tsx
        {actions.length > 0 && (
          <div
            className={cn(
              'flex shrink-0 items-center transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100',
              prefs.alwaysShowActions || picker ? 'opacity-100' : 'opacity-0',
            )}
          >
            {/* existing React / Reply / Copy / Delete ActionButtons unchanged */}
            <ActionButton label="More actions" onClick={openMenu}>
              <DotsThreeIcon size={16} />
            </ActionButton>
          </div>
        )}
```

Replace the old `actionable` condition with `actions.length > 0`, and add `touch-target` to `ActionButton`'s class list.

6. In `ChatPane.tsx` nothing changes yet (`onSelect` stays a no-op until Task 10).

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect` → PASS (menu, thread, connect).
Run: `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src
git commit -m "feat(web): message menu with reaction bar, touch swipe-to-reply, always-visible actions"
```

---

### Task 10: Web select mode

**Files:**
- Create: `apps/web/src/features/connect/SelectBar.tsx`
- Modify: `apps/web/src/features/connect/Bubble.tsx`, `apps/web/src/features/connect/ChatPane.tsx`
- Test: `apps/web/src/features/connect/menu.test.tsx` (extend)

**Interfaces:**
- Consumes: `selectionToText`, `messageActions` (Task 3); `threadKeyDown` `onToggle` (Task 8).
- Produces:
  - `SelectBar({ count, canDelete, onCopy, onDelete, onCancel }: { count: number; canDelete: boolean; onCopy: () => void; onDelete: () => void; onCancel: () => void })`
  - `Bubble` props: `selecting?: boolean; selected?: boolean; onToggleSelect?: (m: LocalMessage) => void`

- [ ] **Step 1: Write the failing test** (append to `menu.test.tsx`)

```tsx
import { SelectBar } from './SelectBar';

describe('select bar', () => {
  it('shows the count and only enables delete when allowed', async () => {
    const onCopy = vi.fn();
    const onCancel = vi.fn();
    render(<SelectBar count={2} canDelete={false} onCopy={onCopy} onDelete={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete selected for everyone' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Copy selected' }));
    expect(onCopy).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

And in `thread.test.tsx` add:

```tsx
  it('shows a checkbox in select mode and toggles on click', async () => {
    const onToggleSelect = vi.fn();
    render(<Harness selecting selected={false} onToggleSelect={onToggleSelect} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select message from Maya' }));
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });
```

(add `import userEvent from '@testing-library/user-event';` to `thread.test.tsx`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect`
Expected: FAIL — cannot resolve `./SelectBar`; no checkbox rendered.

- [ ] **Step 3: Implement `SelectBar.tsx`**

```tsx
import { CopyIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';

/** Replaces the chat header while messages are being selected. */
export function SelectBar({
  count,
  canDelete,
  onCopy,
  onDelete,
  onCancel,
}: {
  count: number;
  canDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected messages"
      className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 md:px-4"
    >
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel selection">
        <XIcon size={20} />
      </Button>
      <span className="flex-1 text-[15px] font-semibold" aria-live="polite">
        {count} selected
      </span>
      <Button variant="ghost" size="icon" onClick={onCopy} disabled={!count} aria-label="Copy selected">
        <CopyIcon size={20} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete selected for everyone"
        className="text-danger"
      >
        <TrashIcon size={20} />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Bubble select mode**

In `Bubble.tsx` add props `selecting?: boolean; selected?: boolean; onToggleSelect?: (m: LocalMessage) => void;`. Then:

- When `selecting`, render the root **without** `MessageMenu` (pass `actions={selecting ? [] : actions}`) and without swipe (`useSwipeReply(…, !selecting && prefs.swipeToReply && actions.includes('reply'))`).
- Root gets `onClick={selecting ? () => onToggleSelect?.(m) : undefined}` and `aria-selected={selecting ? selected : undefined}`.
- Inside the bubble row, before the avatar slot:

```tsx
        {selecting && (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label={`Select message from ${senderLabel}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(m);
            }}
            className={cn(
              'touch-target flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-sm border',
              selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-surface',
            )}
          >
            {selected && <CheckIcon size={14} aria-hidden="true" />}
          </button>
        )}
```

- Hide the hover actions bar while `selecting`.

- [ ] **Step 5: ChatPane select mode**

1. Imports: `import { selectionToText } from '@vybora/core';` (merge), `import { SelectBar } from './SelectBar';`.
2. State and helpers:

```tsx
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  useEffect(() => setSelection(null), [id]);
  const toggle = (mid: string) =>
    setSelection((s) => {
      const next = new Set(s ?? []);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  const selectedMessages = ordered.filter((m) => selection?.has(m.id));
  const canBulkDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => messageActions(m, m.senderId === userId).includes('delete'));
  const copySelection = () => {
    void navigator.clipboard?.writeText(selectionToText(selectedMessages, { nameOf }));
    toast.show(selectedMessages.length === 1 ? 'Message copied' : `${selectedMessages.length} messages copied`, 'success');
    setSelection(null);
  };
```

3. In the keydown effect, close select mode first:

```tsx
      } else if (e.key === 'Escape' && selection && !document.querySelector('[role="dialog"],[role="menu"]')) {
        setSelection(null);
      } else if (e.key === 'Escape' && details && !document.querySelector('[role="dialog"]'))
```

(add `selection` to that effect's dependency array.)

4. Header: render `selection ? <SelectBar count={selection.size} canDelete={canBulkDelete} onCopy={copySelection} onDelete={() => setBulkDeleting(true)} onCancel={() => setSelection(null)} /> : <header …>…</header>`.
5. Bubble props: `selecting={!!selection}`, `selected={!!selection?.has(m.id)}`, `onToggleSelect={(msg) => toggle(msg.id)}`, `onSelect={(msg) => setSelection(new Set([msg.id]))}`.
6. Keyboard: `onKeyDown={(e) => threadKeyDown(e, { onReply: replyById, onToggle: selection ? toggle : undefined })}`.
7. Bulk delete confirm, next to the existing `ConfirmDialog`:

```tsx
      <ConfirmDialog
        open={bulkDeleting}
        onClose={() => setBulkDeleting(false)}
        onConfirm={() => {
          const targets = selectedMessages.map((m) => m.id);
          setBulkDeleting(false);
          setSelection(null);
          void run(async () => {
            for (const target of targets) await engine!.send(id, { t: 'delete', target });
          });
        }}
        title={`Delete ${selectedMessages.length} messages for everyone?`}
        description="They are removed on every device in this chat."
        confirmLabel="Delete"
        danger
      />
```

(Match the existing `ConfirmDialog` prop names used for single delete in this file — copy them exactly.)

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect` → PASS.
Run: `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/connect
git commit -m "feat(web): select messages to copy or delete together"
```

---

### Task 11: Web chat-list rows

**Files:**
- Create: `apps/web/src/features/connect/ChatRowParts.tsx`
- Modify: `apps/web/src/features/connect/InboxPane.tsx`, `apps/web/src/features/connect/hooks.ts`
- Test: `apps/web/src/features/connect/rows.test.tsx`

**Interfaces:**
- Consumes: `chatRowPreview`, `RowPreview`, `receiptOf`, `formatRowTime`, `formatUnread` (Tasks 1, 3); `Ticks` (Task 7); `useA11y` (Task 6); `joinTypingChannel`, `isMuted`, `muteUntil`, `PreferencePatch`, `SecureConversation` (`@vybora/api`).
- Produces:
  - `RowPreviewText({ preview, unread }: { preview: RowPreview; unread: boolean })`
  - `ChatRowMenu({ children, conv, title, onPrefs, onArchive }: { children: ReactElement; conv: SecureConversation; title: string; onPrefs: (patch: PreferencePatch) => void; onArchive: () => void })`
  - `useInboxTyping(conversationIds: readonly string[], enabled: boolean): Record<string, string[]>` in `hooks.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/connect/rows.test.tsx`:

```tsx
import type { SecureConversation } from '@vybora/api';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRowMenu, RowPreviewText } from './ChatRowParts';
import { useInboxTyping } from './hooks';

const listeners = new Map<string, (who: string, typing: boolean) => void>();
vi.mock('@vybora/api', async (orig) => ({
  ...(await orig<typeof import('@vybora/api')>()),
  joinTypingChannel: (_c: unknown, conv: string, _u: string, cb: (who: string, t: boolean) => void) => {
    listeners.set(conv, cb);
    return { send: vi.fn(), leave: vi.fn() };
  },
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

afterEach(() => {
  listeners.clear();
  vi.useRealTimers();
});

describe('chat row preview', () => {
  it('shows You: with ticks for my last message', () => {
    render(<RowPreviewText unread={false} preview={{ prefix: 'You', text: 'See you', receipt: 'read', typing: false }} />);
    expect(screen.getByText('You:')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('shows typing in place of the preview', () => {
    render(<RowPreviewText unread={false} preview={{ prefix: null, text: 'typing…', receipt: null, typing: true }} />);
    expect(screen.getByText('typing…')).toHaveClass('text-accent');
  });
});

describe('chat row menu', () => {
  const conv = { id: 'c1', pinned: false, archived: false, mutedUntil: null } as unknown as SecureConversation;
  it('offers pin, mute and archive', async () => {
    const onPrefs = vi.fn();
    const onArchive = vi.fn();
    render(
      <ChatRowMenu conv={conv} title="Maya" onPrefs={onPrefs} onArchive={onArchive}>
        <a href="/messages/c1">Maya</a>
      </ChatRowMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Maya'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }));
    expect(onPrefs).toHaveBeenCalledWith({ pinned: true });
    fireEvent.contextMenu(screen.getByText('Maya'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalled();
  });
});

describe('typing in the chat list', () => {
  it('clears a typing indicator that never receives a stop after 5 seconds', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInboxTyping(['c1', 'c2'], true));
    act(() => listeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.c1).toEqual([]);
  });

  it('joins nothing when disabled', () => {
    renderHook(() => useInboxTyping(['c1'], false));
    expect(listeners.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/rows.test.tsx`
Expected: FAIL — cannot resolve `./ChatRowParts`; `useInboxTyping` not exported.

- [ ] **Step 3: Implement `useInboxTyping` in `hooks.ts`**

```ts
/** Typing users per conversation for the chat list (max 20 chats; 5 s expiry). */
export function useInboxTyping(conversationIds: readonly string[], enabled: boolean) {
  const { userId } = useMe();
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const key = conversationIds.slice(0, 20).join(',');

  useEffect(() => {
    setTyping({});
    if (!enabled || !key) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const update = (conv: string, who: string, on: boolean) =>
      setTyping((prev) => {
        const cur = prev[conv] ?? [];
        const next = on ? (cur.includes(who) ? cur : [...cur, who]) : cur.filter((x) => x !== who);
        return { ...prev, [conv]: next };
      });
    const channels = key.split(',').map((conv) =>
      joinTypingChannel(supabase, conv, userId, (who, on) => {
        const t = `${conv}:${who}`;
        const old = timers.get(t);
        if (old) clearTimeout(old);
        update(conv, who, on);
        if (on) timers.set(t, setTimeout(() => update(conv, who, false), 5000));
      }),
    );
    return () => {
      channels.forEach((c) => c.leave());
      timers.forEach(clearTimeout);
    };
  }, [key, enabled, userId]);

  return typing;
}
```

- [ ] **Step 4: Implement `ChatRowParts.tsx`**

```tsx
import { ArchiveIcon, BellIcon, BellSlashIcon, PushPinIcon, PushPinSlashIcon } from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { isMuted, muteUntil, type PreferencePatch, type SecureConversation } from '@vybora/api';
import type { RowPreview } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Ticks } from './Bubble';

export function RowPreviewText({ preview, unread }: { preview: RowPreview; unread: boolean }) {
  if (preview.typing) return <span className="text-msg-sm truncate text-accent">{preview.text}</span>;
  return (
    <span className={cn('text-msg-sm flex min-w-0 items-center gap-1', unread ? 'text-ink' : 'text-muted')}>
      {preview.receipt && (
        <span className="shrink-0 text-subtle">
          <Ticks receipt={preview.receipt} />
        </span>
      )}
      {preview.prefix && <span className="shrink-0">{preview.prefix}:</span>}
      <span className="truncate">{preview.text}</span>
    </span>
  );
}

function Item({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted"
    >
      {children}
    </ContextMenu.Item>
  );
}

const MUTE: { value: '8h' | '1w' | 'always'; label: string }[] = [
  { value: '8h', label: 'For 8 hours' },
  { value: '1w', label: 'For a week' },
  { value: 'always', label: 'Until I turn it back on' },
];

/** Right-click / Shift+F10 on a chat row: pin, mute, archive. */
export function ChatRowMenu({
  children,
  conv,
  title,
  onPrefs,
  onArchive,
}: {
  children: ReactElement;
  conv: SecureConversation;
  title: string;
  onPrefs: (patch: PreferencePatch) => void;
  onArchive: () => void;
}) {
  const muted = isMuted(conv);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`Actions for ${title}`}
          collisionPadding={8}
          className="menu z-50 min-w-48 rounded-md border border-line-strong bg-surface p-1"
        >
          <Item onSelect={() => onPrefs({ pinned: !conv.pinned })}>
            {conv.pinned ? <PushPinSlashIcon size={16} aria-hidden="true" /> : <PushPinIcon size={16} aria-hidden="true" />}
            {conv.pinned ? 'Unpin' : 'Pin'}
          </Item>
          {muted ? (
            <Item onSelect={() => onPrefs({ muted_until: null })}>
              <BellIcon size={16} aria-hidden="true" />
              Unmute
            </Item>
          ) : (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted">
                <BellSlashIcon size={16} aria-hidden="true" />
                Mute
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="menu z-50 min-w-48 rounded-md border border-line-strong bg-surface p-1">
                  {MUTE.map((m) => (
                    <Item key={m.value} onSelect={() => onPrefs({ muted_until: muteUntil(m.value) })}>
                      {m.label}
                    </Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
          <Item onSelect={onArchive}>
            <ArchiveIcon size={16} aria-hidden="true" />
            {conv.archived ? 'Unarchive' : 'Archive'}
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
```

- [ ] **Step 5: Use them in `InboxPane.tsx`**

1. Imports: `import { chatRowPreview, formatRowTime, formatUnread, receiptOf } from '@vybora/core';`, `import { useA11y } from '@/features/a11y/A11yProvider';`, `import { ChatRowMenu, RowPreviewText } from './ChatRowParts';`, `useInboxTyping` from `./hooks`, `DotsThreeIcon` from Phosphor.
2. After `previews`:

```tsx
  const { prefs: a11y } = useA11y();
  const recentIds = useMemo(
    () =>
      [...convs]
        .filter((c) => c.id !== activeId && !c.archived)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .slice(0, 20)
        .map((c) => c.id),
    [convs, activeId],
  );
  const typing = useInboxTyping(recentIds, !!engine);
  const memberName = (c: SecureConversation, uid: string) => {
    const m = c.members.find((x) => x.id === uid);
    return nicknames.data?.[uid] ?? (m?.display_name || m?.username || 'Someone');
  };
  const archive = (c: SecureConversation) => {
    const next = !c.archived;
    prefs(c, { archived: next });
    if (next)
      toast.show('Archived', 'success', { label: 'Undo', onClick: () => prefs(c, { archived: false }) });
  };
```

3. In the row, compute and render:

```tsx
            const preview = chatRowPreview(last, {
              myUserId: userId,
              isGroup: c.kind === 'group',
              typingUserIds: typing[c.id] ?? [],
              nameOf: (uid) => memberName(c, uid),
              receipt: last ? receiptOf(last, userId, c.members) : undefined,
            });
            const muted = isMuted(c) || !c.notificationsEnabled;
```

- Wrap the `<Link …>` in `<ChatRowMenu conv={c} title={title} onPrefs={(p) => prefs(c, p)} onArchive={() => archive(c)}>…</ChatRowMenu>`.
- Title span: replace `text-[15px]` with `text-msg`.
- Time: `{formatRowTime(last?.createdAt ?? c.lastMessageAt, new Date())}` (remove `listTime` if now unused).
- Preview line: replace the `engine ? \`${mine ? 'You: ' : ''}…\`` expression with `engine ? <RowPreviewText preview={preview} unread={unread} /> : (…existing Encrypted fallback…)`.
- Badge: text `{formatUnread(c.unreadCount)}`; class `muted ? 'bg-surface-strong text-ink' : 'bg-accent text-on-accent'` (replacing the fixed `bg-accent text-on-accent`).
- Hover bar: class `cn('absolute right-2 top-1.5 gap-0.5 rounded-md border border-line bg-surface p-0.5 group-focus-within:flex group-hover:flex', a11y.alwaysShowActions ? 'flex' : 'hidden')`; its archive button calls `archive(c)`; add after it:

```tsx
                  <button
                    type="button"
                    onClick={(e) => {
                      const link = e.currentTarget.closest('li')?.querySelector<HTMLElement>('[data-chat-link]');
                      const r = link?.getBoundingClientRect();
                      link?.dispatchEvent(
                        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: (r?.right ?? 0) - 40, clientY: (r?.top ?? 0) + 20 }),
                      );
                    }}
                    className="touch-target rounded-sm p-1.5 text-muted hover:bg-surface-muted hover:text-ink"
                    aria-label={`More actions for ${title}`}
                  >
                    <DotsThreeIcon size={14} />
                  </button>
```

- Remove the now-unused `mine` and `title=` attributes on those buttons (tooltips come from `aria-label`).

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/rows.test.tsx` → PASS (5 tests).
Run: `pnpm --filter @vybora/web test` and `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → pass / exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/connect
git commit -m "feat(web): chat rows with ticks, sender, typing, badges and row menu with undo"
```

---

### Task 12: Web last seen, activity and reciprocal online status

**Files:**
- Modify: `apps/web/src/features/connect/hooks.ts`, `apps/web/src/features/connect/ConnectProvider.tsx`, `apps/web/src/features/connect/ChatPane.tsx`, `apps/web/src/features/connect/InboxPane.tsx`, `apps/web/src/features/connect/PrivacyPage.tsx`
- Test: `apps/web/src/features/connect/rows.test.tsx` (extend)

**Interfaces:**
- Consumes: `touchActivity`, `fetchLastSeen`, `qk.connect.lastSeen` (Task 5); `headerStatus` (Task 3).
- Produces: `useLastSeen(userId: string | undefined, enabled: boolean)` → TanStack query whose `data` is `string | null` (never throws to the UI).

- [ ] **Step 1: Write the failing test** (append to `rows.test.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useLastSeen } from './hooks';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('last seen in the header', () => {
  it('returns the allowed time for a peer', async () => {
    fetchLastSeen.mockResolvedValue({ maya: '2026-10-15T09:12:00Z' });
    const { result } = renderHook(() => useLastSeen('maya', true), { wrapper });
    await waitFor(() => expect(result.current.data).toBe('2026-10-15T09:12:00Z'));
  });

  it('falls back quietly when the request fails (offline)', async () => {
    fetchLastSeen.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useLastSeen('maya', true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not ask when my own online status is off', () => {
    fetchLastSeen.mockClear();
    renderHook(() => useLastSeen('maya', false), { wrapper });
    expect(fetchLastSeen).not.toHaveBeenCalled();
  });
});
```

Update the existing `vi.mock('@vybora/api', …)` factory at the top of the file to also return `fetchLastSeen: (...a: unknown[]) => fetchLastSeen(...a)`, and declare `const fetchLastSeen = vi.fn();` with `vi.hoisted` so it exists when the mock factory runs:

```ts
const { fetchLastSeen } = vi.hoisted(() => ({ fetchLastSeen: vi.fn() }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/rows.test.tsx`
Expected: FAIL — `useLastSeen` is not exported.

- [ ] **Step 3: Implement `useLastSeen` in `hooks.ts`**

```ts
/** A peer's last seen (null when hidden). Disabled while my own online status is off. */
export function useLastSeen(peerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.connect.lastSeen(peerId ?? ''),
    enabled: enabled && !!peerId,
    queryFn: async () => (await fetchLastSeen(supabase, [peerId!]))[peerId!] ?? null,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
```

(add `fetchLastSeen` to the `@vybora/api` import.)

- [ ] **Step 4: Record activity in `ConnectProvider.tsx`**

Add `touchActivity` to the `@vybora/api` import, and after the presence effect:

```tsx
  // "Last seen": only recorded while the user shows their online status.
  useEffect(() => {
    if (!engine || !userId || !privacy.data?.show_online) return;
    const touch = () => {
      if (document.visibilityState === 'visible') void touchActivity(supabase).catch(() => undefined);
    };
    touch();
    const timer = setInterval(touch, 120_000);
    document.addEventListener('visibilitychange', touch);
    window.addEventListener('focus', touch);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', touch);
      window.removeEventListener('focus', touch);
    };
  }, [engine, userId, privacy.data?.show_online]);
```

- [ ] **Step 5: Header and reciprocity in `ChatPane.tsx`**

1. Imports: `headerStatus` from `@vybora/core`; `touchActivity` from `@vybora/api`; `useLastSeen` from `./hooks`.
2. Reciprocal presence:

```tsx
  const showOnline = !!privacy.data?.show_online;
  useEffect(
    () => (peerId && showOnline ? watchPresence(supabase, [peerId], (s) => setOnline(s.has(peerId))) : undefined),
    [peerId, showOnline],
  );
  useEffect(() => {
    if (!showOnline) setOnline(false);
  }, [showOnline]);
  const lastSeen = useLastSeen(peerId, showOnline && conv?.kind === 'direct' && !online);
```

(replace the existing `watchPresence` effect.)

3. Replace the `subtitle` expression:

```tsx
  const subtitle = headerStatus({
    isGroup: conv?.kind === 'group',
    memberCount: conv?.members.length ?? 0,
    typingNames,
    online,
    lastSeenAt: lastSeen.data ?? null,
    now: new Date(),
  });
```

4. In `sendText`, after sending: `if (showOnline) void touchActivity(supabase).catch(() => undefined);`.

- [ ] **Step 6: Reciprocal dots in `InboxPane.tsx`**

Add a privacy query and gate presence:

```tsx
  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId),
  });
  const showOnline = !!privacy.data?.show_online;
  useEffect(() => {
    if (!peersKey || !showOnline) {
      setOnline(new Set());
      return;
    }
    return watchPresence(supabase, peersKey.split(','), setOnline);
  }, [peersKey, showOnline]);
```

(replace the existing presence effect; import `useQuery`, `fetchConnectPrivacy`.)

- [ ] **Step 7: Privacy copy in `PrivacyPage.tsx`**

```tsx
        {toggle(
          'show_online',
          'Show when I’m online and last seen',
          'Only people you share a chat with can see it. If you turn this off, you won’t see other people’s either.',
          <CircleIcon size={18} />,
        )}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @vybora/web exec vitest run src/features/connect/rows.test.tsx` → PASS.
Run: `pnpm --filter @vybora/web test` and `pnpm --filter @vybora/web exec tsc -p tsconfig.json --noEmit` → pass / exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/connect
git commit -m "feat(web): last seen in chat header, reciprocal online status"
```

---

### Task 13: Mobile accessibility provider, screen, text scaling, high contrast

**Files:**
- Create: `apps/mobile/src/lib/a11y.tsx`, `apps/mobile/src/lib/haptics.ts`, `apps/mobile/src/app/messages/accessibility.tsx`
- Modify: `apps/mobile/src/lib/theme.ts`, `apps/mobile/src/components/Text.tsx`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/settings.tsx`
- Test: `apps/mobile/src/__tests__/a11y.test.tsx`

**Interfaces:**
- Consumes: `A11yPrefs`, `DEFAULT_A11Y_PREFS`, `parseA11yPrefs`, `resolveReduceMotion`, `TEXT_SIZE_PX`, `A11Y_STORAGE_KEY` (Task 4); `highContrastThemes` (Task 4).
- Produces:
  - `A11yProvider`, `useA11y(): { prefs; setPrefs(patch); reduceMotion: boolean; textScale: number }` (defaults outside the provider)
  - `useHaptics(): (kind: 'light' | 'medium' | 'selection') => void`
  - `Text` prop `scale?: boolean` (applies `textScale` to fontSize/lineHeight)
  - Route `/messages/accessibility`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/__tests__/a11y.test.tsx`:

```tsx
import { A11Y_STORAGE_KEY } from '@vybora/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AccessibilityScreen from '@/app/messages/accessibility';
import { A11yProvider } from '@/lib/a11y';

const mockSet = jest.fn(() => Promise.resolve());
const mockGet = jest.fn(() => Promise.resolve<string | null>(null));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGet(...(a as [])),
  setItemAsync: (...a: unknown[]) => mockSet(...(a as [])),
}));

describe('Accessibility screen', () => {
  beforeEach(() => {
    mockSet.mockClear();
    mockGet.mockResolvedValue(null);
  });

  it('saves high contrast and text size on this device', async () => {
    render(
      <A11yProvider>
        <AccessibilityScreen />
      </A11yProvider>,
    );
    fireEvent(screen.getByLabelText('High contrast'), 'valueChange', true);
    fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenLastCalledWith(
        A11Y_STORAGE_KEY,
        expect.stringContaining('"highContrast":true'),
      ),
    );
    expect(mockSet).toHaveBeenLastCalledWith(A11Y_STORAGE_KEY, expect.stringContaining('"textSize":"lg"'));
  });

  it('loads saved settings', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ textSize: 'xl' }));
    render(
      <A11yProvider>
        <AccessibilityScreen />
      </A11yProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Extra large' })).toHaveProp('accessibilityState', { checked: true }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/a11y.test.tsx`
Expected: FAIL — cannot find module `@/app/messages/accessibility`.

- [ ] **Step 3: Implement `lib/a11y.tsx`**

```tsx
import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  parseA11yPrefs,
  resolveReduceMotion,
  TEXT_SIZE_PX,
  type A11yPrefs,
} from '@vybora/core';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

export interface A11yState {
  prefs: A11yPrefs;
  setPrefs: (patch: Partial<A11yPrefs>) => void;
  reduceMotion: boolean;
  /** Message/row/composer text multiplier (1 = 15 px base). */
  textScale: number;
}

const FALLBACK: A11yState = {
  prefs: DEFAULT_A11Y_PREFS,
  setPrefs: () => undefined,
  reduceMotion: false,
  textScale: 1,
};
const Ctx = createContext<A11yState | null>(null);
export const useA11y = () => useContext(Ctx) ?? FALLBACK;

/** Per-device accessibility settings (SecureStore; never synced). */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<A11yPrefs>(DEFAULT_A11Y_PREFS);
  const [systemReduced, setSystemReduced] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(A11Y_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        loaded.current = true;
        setState(parseA11yPrefs(raw));
      })
      .catch(() => {
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    void SecureStore.setItemAsync(A11Y_STORAGE_KEY, JSON.stringify(prefs)).catch(() => undefined);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<A11yPrefs>) => {
    loaded.current = true;
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<A11yState>(
    () => ({
      prefs,
      setPrefs,
      reduceMotion: resolveReduceMotion(prefs.reduceMotion, systemReduced),
      textScale: TEXT_SIZE_PX[prefs.textSize] / TEXT_SIZE_PX.md,
    }),
    [prefs, setPrefs, systemReduced],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

`lib/haptics.ts`:

```ts
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { useA11y } from './a11y';

export type HapticKind = 'light' | 'medium' | 'selection';

/** Haptic feedback that respects Settings → Accessibility → Haptics. */
export function useHaptics() {
  const { prefs } = useA11y();
  return useCallback(
    (kind: HapticKind) => {
      if (!prefs.haptics) return;
      if (kind === 'selection') void Haptics.selectionAsync().catch(() => undefined);
      else
        void Haptics.impactAsync(
          kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
        ).catch(() => undefined);
    },
    [prefs.haptics],
  );
}
```

- [ ] **Step 4: High contrast + text scale**

`lib/theme.ts`:

```ts
import { highContrastThemes, iconSizes, radii, spacing, themes, type ThemeTokens } from '@vybora/config';
import { useColorScheme } from 'react-native';
import { useA11y } from './a11y';

export function useTheme(): ThemeTokens & { dark: boolean } {
  const scheme = useColorScheme();
  const { prefs } = useA11y();
  const dark = scheme === 'dark';
  const set = prefs.highContrast ? highContrastThemes : themes;
  return { ...(dark ? set.dark : set.light), dark };
}
```

(keep the rest of the file unchanged.)

`components/Text.tsx` — add the `scale` prop:

```tsx
import { useA11y } from '@/lib/a11y';
// …
export const Text = forwardRef<RNText, TextProps & { mono?: boolean; scale?: boolean }>(function Text(
  { style, mono, scale, ...rest },
  ref,
) {
  const { textScale } = useA11y();
  const flat = withFamily(style, mono);
  const scaled =
    scale && textScale !== 1
      ? {
          ...flat,
          fontSize: flat.fontSize ? flat.fontSize * textScale : undefined,
          lineHeight: flat.lineHeight ? flat.lineHeight * textScale : undefined,
        }
      : flat;
  return <RNText ref={ref} {...rest} style={scaled} />;
});
```

Apply `scale` to message text in `Bubble.tsx` (body, caption), the row title and preview in `app/messages/index.tsx`, and the composer `TextInput` (add the same scaling to `TextInput` via a `scale` prop, used by `Composer.tsx`).

- [ ] **Step 5: Implement the screen**

`app/messages/accessibility.tsx`:

```tsx
import type { ReduceMotionPref, TextSize } from '@vybora/core';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Text } from '@/components/Text';
import { Row, SectionCard, useCc } from '@/features/connect/ui/primitives';
import { useA11y } from '@/lib/a11y';
import { radii } from '@/lib/theme';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const cc = useCc();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: cc.lineStrong,
        borderRadius: radii.md,
        overflow: 'hidden',
        marginHorizontal: 16,
        marginVertical: 12,
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: cc.lineStrong,
              backgroundColor: on ? cc.accent : 'transparent',
            }}
          >
            <Text style={{ color: on ? cc.onAccent : cc.text, fontWeight: '500', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AccessibilityScreen() {
  const cc = useCc();
  const { prefs, setPrefs } = useA11y();
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: cc.accent, false: cc.strong }}
    />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: cc.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <SectionCard title="Motion & gestures">
        <Text style={{ color: cc.text, fontSize: 15, fontWeight: '500', paddingHorizontal: 16, paddingTop: 12 }}>
          Reduce motion
        </Text>
        <Segmented<ReduceMotionPref>
          label="Reduce motion"
          value={prefs.reduceMotion}
          options={[
            { value: 'system', label: 'Match system' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(reduceMotion) => setPrefs({ reduceMotion })}
        />
        <Row
          icon="corner-up-left"
          label="Swipe to reply"
          description="Drag a message right to reply. Reply is always in the long-press menu."
          right={toggle('Swipe to reply', prefs.swipeToReply, (swipeToReply) => setPrefs({ swipeToReply }))}
        />
        <Row
          icon="smartphone"
          label="Haptics"
          description="A light tap when a swipe or menu responds."
          right={toggle('Haptics', prefs.haptics, (haptics) => setPrefs({ haptics }))}
        />
      </SectionCard>

      <SectionCard title="Text">
        <Segmented<TextSize>
          label="Message text size"
          value={prefs.textSize}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Default' },
            { value: 'lg', label: 'Large' },
            { value: 'xl', label: 'Extra large' },
          ]}
          onChange={(textSize) => setPrefs({ textSize })}
        />
        <Text
          scale
          style={{
            color: cc.text,
            fontSize: 15,
            lineHeight: 21,
            margin: 16,
            marginTop: 0,
            padding: 10,
            borderWidth: 1,
            borderColor: cc.line,
            borderRadius: radii.lg,
            borderBottomLeftRadius: radii.sm,
            backgroundColor: cc.bubbleIn,
          }}
        >
          This is how messages will look.
        </Text>
      </SectionCard>

      <SectionCard title="Display">
        <Row
          icon="eye"
          label="High contrast"
          description="Stronger text and borders in light and dark themes."
          right={toggle('High contrast', prefs.highContrast, (highContrast) => setPrefs({ highContrast }))}
        />
        <Row
          icon="more-horizontal"
          label="Always show message actions"
          description="Show a reply button on every message instead of only in the long-press menu."
          right={toggle('Always show message actions', prefs.alwaysShowActions, (alwaysShowActions) =>
            setPrefs({ alwaysShowActions }),
          )}
        />
      </SectionCard>
      <Text style={{ color: cc.textSubtle, fontSize: 12, paddingHorizontal: 4 }}>Saved on this device only.</Text>
    </ScrollView>
  );
}
```

- [ ] **Step 6: Wire provider, route, settings link**

`app/_layout.tsx`:
- `import { A11yProvider } from '@/lib/a11y';`
- In `RootLayout`, wrap: `<GestureHandlerRootView style={{ flex: 1 }}><A11yProvider><SafeAreaProvider>…</SafeAreaProvider></A11yProvider></GestureHandlerRootView>`.
- In `Navigator`'s `<Stack>`, add `<Stack.Screen name="messages/accessibility" options={{ title: 'Accessibility' }} />`.

`app/settings.tsx` — new card after "Privacy & security":

```tsx
        <SectionCard title="Accessibility">
          <Row
            icon="eye"
            label="Accessibility"
            description="Motion, text size, contrast, gestures"
            onPress={() => router.push('/messages/accessibility')}
          />
        </SectionCard>
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/a11y.test.tsx` → PASS (2 tests).
Run: `pnpm --filter @vybora/mobile test` → all mobile tests pass.
Run: `pnpm --filter @vybora/mobile exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Settings → Accessibility, text scaling, high contrast, haptics"
```

---

### Task 14: Mobile conversation layout (runs, tails, date chips, unread, jump, announcements)

**Files:**
- Create: `apps/mobile/src/features/connect/ui/ThreadParts.tsx`
- Modify: `apps/mobile/src/features/connect/ui/Bubble.tsx`, `apps/mobile/src/app/messages/[id].tsx`
- Test: `apps/mobile/src/__tests__/thread.test.tsx`

**Interfaces:**
- Consumes: `layoutThread`, `ThreadItem`, `receiptOf`, `messageSummary`, `dayLabel`, `formatClock`, `formatUnread` (Tasks 1–3); `useA11y`, `useHaptics` (Task 13).
- Produces:
  - `DateChip({ label, floating }: { label: string; floating?: boolean })`, `UnreadDivider({ count })`, `JumpToLatest({ count, onPress })`
  - `Bubble` props `runStart: boolean; runEnd: boolean; avatar?: { path: string | null; name: string }`; tail `testID="bubble-tail"`; `Ticks` exported; `Receipt` re-exported from core.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/__tests__/thread.test.tsx`:

```tsx
import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { render, screen } from '@testing-library/react-native';
import { Bubble } from '@/features/connect/ui/Bubble';
import { useThemeDef } from '@/features/connect/ui/primitives';
import { DateChip, JumpToLatest, UnreadDivider } from '@/features/connect/ui/ThreadParts';

const msg: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: 'maya',
  senderDeviceId: 'd1',
  createdAt: '2026-10-15T14:05:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'See you at 7',
  reactions: {},
};

function Harness({ runEnd }: { runEnd: boolean }) {
  const theme = useThemeDef(resolveChatTheme({}));
  return (
    <Bubble
      message={msg}
      mine={false}
      theme={theme}
      showSender={false}
      runStart
      runEnd={runEnd}
      onLongPress={jest.fn()}
      onRetry={jest.fn()}
      onOpenImage={jest.fn()}
      nameOf={() => 'Maya'}
    />
  );
}

describe('mobile conversation layout', () => {
  it('draws a tail only on the last bubble of a run and labels the message', () => {
    const { rerender } = render(<Harness runEnd />);
    expect(screen.getByTestId('bubble-tail')).toBeTruthy();
    expect(screen.getByLabelText(/^Maya, .+, See you at 7$/)).toBeTruthy();
    rerender(<Harness runEnd={false} />);
    expect(screen.queryByTestId('bubble-tail')).toBeNull();
  });

  it('renders chips, the unread divider and the jump button accessibly', () => {
    render(
      <>
        <DateChip label="Today" />
        <UnreadDivider count={2} />
        <JumpToLatest count={2} onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('header', { name: '2 unread messages' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jump to latest message, 2 new' })).toBeTruthy();
  });
});
```

(Use whatever theme helper the existing `connect.test.tsx` uses to build a `ResolvedTheme`; `useThemeDef` is exported from `primitives.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx`
Expected: FAIL — cannot find module `@/features/connect/ui/ThreadParts`.

- [ ] **Step 3: Implement `ThreadParts.tsx`**

```tsx
import { formatUnread } from '@vybora/core';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

export function DateChip({ label, floating }: { label: string; floating?: boolean }) {
  const cc = useCc();
  return (
    <View style={{ alignItems: 'center', marginVertical: floating ? 0 : 10 }} pointerEvents="none">
      <Text
        mono
        accessibilityRole="header"
        style={{
          color: cc.textMuted,
          fontSize: 11,
          fontWeight: '500',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: cc.line,
          backgroundColor: cc.panel,
          overflow: 'hidden',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function UnreadDivider({ count }: { count: number }) {
  const cc = useCc();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10, paddingHorizontal: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: cc.accent }} />
      <Text mono accessibilityRole="header" style={{ color: cc.accent, fontSize: 11, fontWeight: '500' }}>
        {count === 1 ? '1 unread message' : `${count} unread messages`}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: cc.accent }} />
    </View>
  );
}

export function JumpToLatest({ count, onPress }: { count: number; onPress: () => void }) {
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 44,
        height: 44,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: cc.lineStrong,
        backgroundColor: cc.panel,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="arrow-down" size={18} color={cc.text} />
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            minWidth: 20,
            height: 20,
            borderRadius: radii.sm,
            paddingHorizontal: 4,
            backgroundColor: cc.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text mono style={{ color: cc.onAccent, fontSize: 11, fontWeight: '500' }}>
            {formatUnread(count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
```

Register the icon in `components/Icon.tsx`: add `import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';` and `'arrow-down': ArrowDownIcon,` to `ICONS`.

- [ ] **Step 4: Update mobile `Bubble.tsx`**

1. Imports: `import Svg, { Path } from 'react-native-svg';`, `import { formatClock, messageSummary, type Receipt } from '@vybora/core';`, `import { Avatar } from '@/components/ui';`. Replace the local `Receipt` type with `export type { Receipt } from '@vybora/core';`; `export function Ticks`.
2. Tail:

```tsx
function Tail({ mine, fill, stroke }: { mine: boolean; fill: string; stroke?: string }) {
  return (
    <Svg
      testID="bubble-tail"
      width={8}
      height={10}
      viewBox="0 0 8 10"
      style={{
        position: 'absolute',
        bottom: 0,
        ...(mine ? { right: -7 } : { left: -7, transform: [{ scaleX: -1 }] }),
      }}
    >
      <Path d="M0 0C0.5 6 3.5 9 8 10H0Z" fill={fill} />
      {stroke ? <Path d="M0 0C0.5 6 3.5 9 8 10H0" fill="none" stroke={stroke} strokeWidth={1} /> : null}
    </Svg>
  );
}
```

3. Props: add `runStart: boolean; runEnd: boolean; avatar?: { path: string | null; name: string };`.
4. `bubbleStyle` radii: `borderBottomRightRadius: mine && runEnd ? radii.sm : radii.lg`, `borderBottomLeftRadius: !mine && runEnd ? radii.sm : radii.lg`.
5. Outer `View`: `marginTop: runStart ? 8 : 2, marginBottom: 0` (replacing `marginVertical: 2`); add `accessible accessibilityLabel={[mine ? 'You' : nameOf(m.senderId), formatClock(m.createdAt), messageSummary(m), receipt ? RECEIPT_LABEL[receipt] : null].filter(Boolean).join(', ')}` with the same `RECEIPT_LABEL` map as web.
6. Wrap the `Pressable` bubble in a row with the group avatar slot, and add the tail inside the `Pressable`:

```tsx
      <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' }}>
        {avatar && !mine &&
          (runEnd ? <Avatar path={avatar.path} name={avatar.name} size={28} /> : <View style={{ width: 28 }} />)}
        <Pressable …existing props…>
          {inner}
          {runEnd && (
            <Tail
              mine={mine}
              fill={filled ? theme.outgoing : theme.incoming}
              stroke={filled ? undefined : cc.line}
            />
          )}
        </Pressable>
      </View>
```

7. Body/caption `Text`: add `scale`.

- [ ] **Step 5: Use `layoutThread` in `app/messages/[id].tsx`**

1. Imports: `import { dayLabel, layoutThread, messageSummary, receiptOf } from '@vybora/core';`, `import { isMuted } from '@vybora/api';` (merge), `import { AccessibilityInfo, type ViewToken } from 'react-native';` (merge), `import { useRef } from 'react';` (merge), `import { DateChip, JumpToLatest, UnreadDivider } from '@/features/connect/ui/ThreadParts';`, `import { useA11y } from '@/lib/a11y';`. Remove `receiptFor` (use `receiptOf`).
2. Rows for the inverted list:

```tsx
  const [readMark, setReadMark] = useState<{ id: string; seq: number } | null>(null);
  useEffect(() => {
    if (conv && readMark?.id !== id) setReadMark({ id, seq: conv.lastReadSeq });
  }, [conv, id, readMark?.id]);
  const rows = useMemo(
    () =>
      layoutThread([...ordered].reverse(), {
        myUserId: userId,
        lastReadSeq: readMark?.id === id ? readMark.seq : Number.MAX_SAFE_INTEGER,
        now: new Date(),
      }).reverse(),
    [ordered, userId, readMark, id],
  );
```

3. Floating date chip, jump button and announcements:

```tsx
  const { reduceMotion } = useA11y();
  const list = useRef<FlatList<(typeof rows)[number]>>(null);
  const [floatingDay, setFloatingDay] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [away, setAway] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const lastSeenSeq = useRef(0);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Inverted list: the highest index on screen is the oldest (top) row.
    const top = viewableItems.reduce<ViewToken | null>((a, b) => ((b.index ?? 0) > (a?.index ?? -1) ? b : a), null);
    const item = top?.item as (typeof rows)[number] | undefined;
    if (!item) return;
    setFloatingDay(item.type === 'message' ? dayLabel(item.message.createdAt, new Date()) : item.type === 'date' ? item.label : null);
  }).current;
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setFloatingDay(null), reduceMotion ? 0 : 1500);
  };

  useEffect(() => {
    lastSeenSeq.current = 0;
    setNewCount(0);
  }, [id]);
  useEffect(() => {
    const newest = ordered[0]?.seq ?? 0;
    if (!away || !lastSeenSeq.current) {
      lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
      setNewCount(0);
      return;
    }
    const fresh = ordered.filter((m) => (m.seq ?? 0) > lastSeenSeq.current && m.senderId !== userId).length;
    if (fresh) setNewCount((c) => c + fresh);
    lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
  }, [ordered, userId, away]);

  const announced = useRef<{ conv: string; id: string } | null>(null);
  useEffect(() => {
    if (!messages.isSuccess) return;
    const newest = ordered.find((m) => m.senderId !== userId);
    if (announced.current?.conv !== id) {
      announced.current = { conv: id, id: newest?.id ?? '' };
      return;
    }
    if (!newest || newest.id === announced.current.id) return;
    announced.current = { conv: id, id: newest.id };
    const muted = conv ? isMuted(conv) || !conv.notificationsEnabled : true;
    if (!muted) AccessibilityInfo.announceForAccessibility(`${nameOf(newest.senderId)}: ${messageSummary(newest)}`);
  }, [ordered, messages.isSuccess, userId, id, conv, nameOf]);

  // Open at the unread divider once per chat.
  const positioned = useRef<string | null>(null);
  useEffect(() => {
    if (positioned.current === id || readMark?.id !== id || !rows.length) return;
    positioned.current = id;
    const index = rows.findIndex((r) => r.type === 'unread');
    if (index > 0) list.current?.scrollToIndex({ index, viewPosition: 1, animated: false });
  }, [rows, id, readMark]);
```

4. Replace the `FlatList` props:

```tsx
        <View style={{ flex: 1 }}>
          <FlatList
            ref={list}
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={{ paddingVertical: 12 }}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement } = e.nativeEvent;
              setAway(contentOffset.y > layoutMeasurement.height);
            }}
            scrollEventThrottle={100}
            onScrollEndDrag={scheduleHide}
            onMomentumScrollEnd={scheduleHide}
            onScrollToIndexFailed={(info) =>
              list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
            }
            renderItem={({ item }) => {
              if (item.type === 'date') return <DateChip label={item.label} />;
              if (item.type === 'unread') return <UnreadDivider count={item.count} />;
              const m = item.message;
              const group = conv?.kind === 'group';
              const sender = conv?.members.find((x) => x.id === m.senderId);
              return (
                <Bubble
                  message={m}
                  mine={item.mine}
                  theme={def}
                  senderName={group ? nameOf(m.senderId) : undefined}
                  showSender={!!group && item.runStart}
                  runStart={item.runStart}
                  runEnd={item.runEnd}
                  avatar={group && !item.mine ? { path: sender?.avatar_path ?? null, name: sender?.username ?? '?' } : undefined}
                  receipt={receiptOf(m, userId, conv?.members ?? [])}
                  onLongPress={setSelected}
                  onRetry={(x) => void run(() => engine!.retry(id, x.id))}
                  onOpenImage={setViewer}
                  nameOf={nameOf}
                />
              );
            }}
            ListFooterComponent={/* unchanged */}
            ListEmptyComponent={/* unchanged */}
          />
          {floatingDay && (
            <View style={{ position: 'absolute', top: 8, left: 0, right: 0 }} pointerEvents="none">
              <DateChip label={floatingDay} floating />
            </View>
          )}
          {away && (
            <JumpToLatest
              count={newCount}
              onPress={() => {
                setNewCount(0);
                list.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
              }}
            />
          )}
        </View>
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx` → PASS.
Run: `pnpm --filter @vybora/mobile test` and `pnpm --filter @vybora/mobile exec tsc -p tsconfig.json --noEmit` → pass / exit 0. (Update `connect.test.tsx` Bubble renders with `runStart`/`runEnd` if it fails on missing props.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): runs with tails, date chips, unread divider, jump to latest, announcements"
```

---

### Task 15: Mobile swipe-to-reply, message menu, select mode

**Files:**
- Create: `apps/mobile/src/features/connect/ui/SwipeToReply.tsx`
- Modify: `apps/mobile/src/features/connect/ui/MessageActions.tsx`, `apps/mobile/src/features/connect/ui/Bubble.tsx`, `apps/mobile/src/app/messages/[id].tsx`
- Test: `apps/mobile/src/__tests__/thread.test.tsx` (extend)

**Interfaces:**
- Consumes: `SWIPE_REPLY_THRESHOLD`, `swipeReplyDecision`, `messageActions`, `MessageAction`, `selectionToText` (Task 3); `useA11y`, `useHaptics` (Task 13).
- Produces:
  - `SwipeToReply({ children, onReply, enabled, color }: { children: ReactNode; onReply: () => void; enabled: boolean; color: string })`
  - `MessageActions` props: replaces `onReply/onCopy/onDelete` with `actions: MessageAction[]; onAction: (a: MessageAction) => void` (keeps `message`, `myReaction`, `onClose`, `onReact`)
  - `Bubble` props: `selecting?: boolean; selected?: boolean; onToggleSelect?: (m: LocalMessage) => void; onReplyPress?: …` (existing) and `showReplyButton?: boolean; onReply?: (m: LocalMessage) => void`

- [ ] **Step 1: Write the failing test** (append to `thread.test.tsx`)

```tsx
import { fireEvent } from '@testing-library/react-native';
import { MessageActions } from '@/features/connect/ui/MessageActions';

describe('message actions sheet', () => {
  it('lists the allowed actions under the reaction bar', () => {
    const onAction = jest.fn();
    render(
      <MessageActions
        message={msg}
        myReaction={null}
        actions={['reply', 'copy', 'select']}
        onClose={jest.fn()}
        onReact={jest.fn()}
        onAction={onAction}
      />,
    );
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(3);
    fireEvent.press(screen.getByText('Select'));
    expect(onAction).toHaveBeenCalledWith('select');
    expect(screen.queryByText('Delete for everyone')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx`
Expected: FAIL — `Select` not found / `actions` prop unknown.

- [ ] **Step 3: Rework `MessageActions.tsx`**

Replace the props and the action list:

```tsx
import type { MessageAction } from '@vybora/core';
// …
const ACTION: Record<MessageAction, { icon: IconName; label: string; danger?: boolean }> = {
  reply: { icon: 'corner-up-left', label: 'Reply' },
  copy: { icon: 'copy', label: 'Copy text' },
  select: { icon: 'check-circle', label: 'Select' },
  delete: { icon: 'trash', label: 'Delete for everyone', danger: true },
};

export function MessageActions({
  message,
  myReaction,
  actions,
  onClose,
  onReact,
  onAction,
}: {
  message: LocalMessage | null;
  myReaction: string | null;
  actions: MessageAction[];
  onClose: () => void;
  onReact: (emoji: string) => void;
  onAction: (a: MessageAction) => void;
}) {
  // …unchanged Modal + reaction bar…
          {actions.map((a) => {
            const def = ACTION[a];
            return (
              <Pressable
                key={a}
                onPress={() => onAction(a)}
                accessibilityRole="menuitem"
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: 20,
                  minHeight: 52,
                  backgroundColor: pressed ? cc.raised : 'transparent',
                })}
              >
                <Icon name={def.icon} size={20} color={def.danger ? cc.danger : cc.textMuted} />
                <Text style={{ color: def.danger ? cc.danger : cc.text, fontSize: 16 }}>{def.label}</Text>
              </Pressable>
            );
          })}
```

- [ ] **Step 4: Implement `SwipeToReply.tsx`**

```tsx
import { SWIPE_REPLY_THRESHOLD, swipeReplyDecision } from '@vybora/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { useA11y } from '@/lib/a11y';
import { useHaptics } from '@/lib/haptics';

const MAX = 96;

/** Drag a bubble right to reply (rightward only; vertical scrolling always wins). */
export function SwipeToReply({
  children,
  onReply,
  enabled,
  color,
}: {
  children: ReactNode;
  onReply: () => void;
  enabled: boolean;
  color: string;
}) {
  const { prefs, reduceMotion } = useA11y();
  const haptic = useHaptics();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const finish = (dx: number, dy: number, vx: number) => {
    if (swipeReplyDecision({ dx, dy, vx, released: true }) === 'trigger') onReply();
  };
  const tick = () => haptic('light');

  const pan = Gesture.Pan()
    .enabled(enabled && prefs.swipeToReply)
    .activeOffsetX([-1000, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(e.translationX, MAX));
      if (!armed.value && e.translationX >= SWIPE_REPLY_THRESHOLD) {
        armed.value = true;
        runOnJS(tick)();
      } else if (armed.value && e.translationX < SWIPE_REPLY_THRESHOLD) armed.value = false;
    })
    .onEnd((e) => {
      runOnJS(finish)(e.translationX, e.translationY, e.velocityX);
    })
    .onFinalize(() => {
      armed.value = false;
      x.value = reduceMotion ? 0 : withTiming(0, { duration: 180 });
    });

  const bubble = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE_REPLY_THRESHOLD], [0, 1], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' }, icon]}
        >
          <Icon name="corner-up-left" size={20} color={color} />
        </Animated.View>
        <Animated.View style={bubble}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
```

- [ ] **Step 5: Bubble select mode and always-visible reply**

In mobile `Bubble.tsx` add props `selecting?: boolean; selected?: boolean; onToggleSelect?: (m: LocalMessage) => void; showReplyButton?: boolean; onReply?: (m: LocalMessage) => void;`:

- `Pressable` gets `onPress={() => (selecting ? onToggleSelect?.(m) : receipt === 'failed' && onRetry(m))}`, `onLongPress={selecting ? undefined : …existing…}`, `accessibilityState={selecting ? { selected: !!selected } : undefined}`.
- Before the avatar slot, when `selecting`:

```tsx
        {selecting && (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 22,
              height: 22,
              borderRadius: radii.sm,
              borderWidth: 1,
              borderColor: selected ? cc.accent : cc.lineStrong,
              backgroundColor: selected ? cc.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            {selected && <Icon name="check" size={14} color={cc.onAccent} />}
          </View>
        )}
```

- When `showReplyButton && !selecting`, render a 44×44 `Pressable` with `accessibilityLabel="Reply"` and the `corner-up-left` icon beside the bubble that calls `onReply?.(m)`.

- [ ] **Step 6: Wire into `app/messages/[id].tsx`**

1. Imports: `messageActions`, `selectionToText`, `type MessageAction` from `@vybora/core`; `SwipeToReply`; `useHaptics`.
2. State:

```tsx
  const haptic = useHaptics();
  const { prefs: a11y } = useA11y();
  const [selection, setSelection] = useState<Set<string> | null>(null);
  useEffect(() => setSelection(null), [id]);
  const toggle = (mid: string) =>
    setSelection((s) => {
      const next = new Set(s ?? []);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  const selectedMessages = [...ordered].reverse().filter((m) => selection?.has(m.id));
  const canBulkDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => messageActions(m, m.senderId === userId).includes('delete'));
  const startReply = (m: LocalMessage) => setReplyTo(m);
```

3. Wrap each `Bubble` in `renderItem`:

```tsx
                <SwipeToReply
                  enabled={!selection && messageActions(m, item.mine).includes('reply')}
                  onReply={() => startReply(m)}
                  color={def.accent}
                >
                  <Bubble
                    …props from Task 14…
                    onLongPress={(x) => {
                      haptic('medium');
                      setSelected(x);
                    }}
                    selecting={!!selection}
                    selected={!!selection?.has(m.id)}
                    onToggleSelect={(x) => toggle(x.id)}
                    showReplyButton={a11y.alwaysShowActions && messageActions(m, item.mine).includes('reply')}
                    onReply={startReply}
                  />
                </SwipeToReply>
```

4. Replace the `MessageActions` usage:

```tsx
      <MessageActions
        message={selected}
        actions={selected ? messageActions(selected, selected.senderId === userId) : []}
        myReaction={
          selected ? (Object.entries(selected.reactions).find(([, u]) => u.includes(userId))?.[0] ?? null) : null
        }
        onClose={() => setSelected(null)}
        onReact={(emoji) => {
          const m = selected!;
          const mine = m.reactions[emoji]?.includes(userId);
          haptic('selection');
          setSelected(null);
          void run(() => engine!.send(id, { t: 'reaction', target: m.id, emoji, remove: mine }));
        }}
        onAction={(a: MessageAction) => {
          const m = selected!;
          setSelected(null);
          if (a === 'reply') startReply(m);
          else if (a === 'copy') void Clipboard.setStringAsync(m.body ?? '');
          else if (a === 'select') setSelection(new Set([m.id]));
          else if (a === 'delete')
            Alert.alert('Delete for everyone?', 'This removes the message on every device in this chat.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void run(() => engine!.send(id, { t: 'delete', target: m.id })) },
            ]);
        }}
      />
```

5. Header while selecting — in the `Stack.Screen options`, when `selection` is set, use:

```tsx
          ...(selection
            ? {
                headerTitle: () => (
                  <Text style={{ color: cc.text, fontWeight: '600', fontSize: 17 }} accessibilityLiveRegion="polite">
                    {selection.size} selected
                  </Text>
                ),
                headerLeft: () => (
                  <Pressable onPress={() => setSelection(null)} accessibilityRole="button" accessibilityLabel="Cancel selection" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={22} color={cc.text} />
                  </Pressable>
                ),
                headerRight: () => (
                  <View style={{ flexDirection: 'row' }}>
                    <Pressable
                      onPress={() => {
                        void Clipboard.setStringAsync(selectionToText(selectedMessages, { nameOf }));
                        setSelection(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Copy selected"
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name="copy" size={20} color={cc.text} />
                    </Pressable>
                    <Pressable
                      disabled={!canBulkDelete}
                      onPress={() =>
                        Alert.alert(`Delete ${selectedMessages.length} messages for everyone?`, 'They are removed on every device in this chat.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => {
                              const targets = selectedMessages.map((m) => m.id);
                              setSelection(null);
                              void run(async () => {
                                for (const target of targets) await engine!.send(id, { t: 'delete', target });
                              });
                            },
                          },
                        ])
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Delete selected for everyone"
                      accessibilityState={{ disabled: !canBulkDelete }}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canBulkDelete ? 1 : 0.4 }}
                    >
                      <Icon name="trash" size={20} color={cc.danger} />
                    </Pressable>
                  </View>
                ),
              }
            : { /* existing headerTitle / headerRight */ }),
```

6. Android back exits select mode: `useEffect(() => { if (!selection) return; const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSelection(null); return true; }); return () => sub.remove(); }, [selection]);` (import `BackHandler`).

7. Jest: if `SwipeToReply` is rendered in any test, add to that test file: `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));` and `import 'react-native-gesture-handler/jestSetup';`.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx` → PASS.
Run: `pnpm --filter @vybora/mobile test` and `pnpm --filter @vybora/mobile exec tsc -p tsconfig.json --noEmit` → pass / exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): swipe to reply with haptics, message menu with Select, select mode"
```

---

### Task 16: Mobile chat-list rows

**Files:**
- Create: `apps/mobile/src/features/connect/ui/UndoBar.tsx`
- Modify: `apps/mobile/src/app/messages/index.tsx`, `apps/mobile/src/features/connect/hooks.ts`
- Test: `apps/mobile/src/__tests__/thread.test.tsx` (extend)

**Interfaces:**
- Consumes: `chatRowPreview`, `RowPreview`, `receiptOf`, `formatRowTime`, `formatUnread` (Tasks 1, 3); `Ticks` (Task 14); `useHaptics` (Task 13).
- Produces:
  - `UndoBar({ message, onUndo, onDone }: { message: string; onUndo: () => void; onDone: () => void })` — visible 5 s
  - `useInboxTyping(conversationIds: readonly string[], enabled: boolean): Record<string, string[]>` in mobile `hooks.ts` (same body as web Task 11, importing `joinTypingChannel` from `@vybora/api`, `supabase` from `@/lib/supabase`, `useMe` from `@/features/auth/AuthProvider`)
  - `ChatRow` prop `preview: RowPreview` (replaces `preview: string`)

- [ ] **Step 1: Write the failing test** (append to `thread.test.tsx`)

```tsx
import { RowPreviewLine } from '@/app/messages/index';

describe('mobile chat row preview', () => {
  it('shows You: with ticks, and typing in the accent colour', () => {
    const { rerender } = render(
      <RowPreviewLine unread={false} preview={{ prefix: 'You', text: 'See you', receipt: 'read', typing: false }} />,
    );
    expect(screen.getByText('You: See you')).toBeTruthy();
    expect(screen.getByLabelText('Read')).toBeTruthy();
    rerender(<RowPreviewLine unread={false} preview={{ prefix: null, text: 'typing…', receipt: null, typing: true }} />);
    expect(screen.getByText('typing…')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx`
Expected: FAIL — `RowPreviewLine` is not exported.

- [ ] **Step 3: Implement `UndoBar.tsx`**

```tsx
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

/** "Archived · Undo" bar above the bottom edge; disappears after 5 seconds. */
export function UndoBar({ message, onUndo, onDone }: { message: string; onUndo: () => void; onDone: () => void }) {
  const cc = useCc();
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 16,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: cc.lineStrong,
        backgroundColor: cc.strong,
      }}
    >
      <Text style={{ color: cc.text, flex: 1, fontSize: 14 }}>{message}</Text>
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
      >
        <Text style={{ color: cc.accent, fontWeight: '600' }}>Undo</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Rows in `app/messages/index.tsx`**

1. Imports: `chatRowPreview`, `formatRowTime`, `formatUnread`, `receiptOf`, `type RowPreview` from `@vybora/core`; `muteUntil` from `@vybora/api` (merge); `ReanimatedSwipeable` from `react-native-gesture-handler/ReanimatedSwipeable`; `Ticks` from `@/features/connect/ui/Bubble`; `UndoBar`; `useInboxTyping` from `@/features/connect/hooks`; `useIsFocused` from `expo-router`; `useHaptics`.
2. Exported preview line:

```tsx
export function RowPreviewLine({ preview, unread }: { preview: RowPreview; unread: boolean }) {
  const cc = useCc();
  if (preview.typing)
    return (
      <Text scale style={{ color: cc.accent, fontSize: 14, flex: 1 }} numberOfLines={1}>
        {preview.text}
      </Text>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
      {preview.receipt && <Ticks receipt={preview.receipt} color={cc.textSubtle} />}
      <Text scale style={{ color: unread ? cc.text : cc.textMuted, fontSize: 14, flex: 1 }} numberOfLines={1}>
        {preview.prefix ? `${preview.prefix}: ${preview.text}` : preview.text}
      </Text>
    </View>
  );
}
```

3. `ChatRow`: change `preview: string` to `preview: RowPreview`; replace the preview `Text` with `<RowPreviewLine preview={preview} unread={unread} />`; badge text `formatUnread(conv.unreadCount)`; badge background `muted ? cc.strong : cc.accent` and text colour `muted ? cc.text : cc.onAccent`; title `Text` gets `scale`.
4. In `Inbox`:

```tsx
  const focused = useIsFocused();
  const haptic = useHaptics();
  const [undo, setUndo] = useState<{ message: string; run: () => void } | null>(null);
  const recentIds = useMemo(
    () => [...convs].filter((c) => !c.archived).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 20).map((c) => c.id),
    [convs],
  );
  // Leave the typing channels while a chat is open on top (it joins its own).
  const typing = useInboxTyping(recentIds, focused);
  const memberName = (c: SecureConversation, uid: string) => {
    const m = c.members.find((x) => x.id === uid);
    return nicknames.data?.[uid] ?? m?.display_name ?? m?.username ?? 'Someone';
  };
  const setPrefs = (c: SecureConversation, patch: Parameters<typeof updateConversationPreferences>[3]) =>
    void updateConversationPreferences(supabase, userId, c.id, patch).then(
      () => qc.invalidateQueries({ queryKey: qk.connect.inbox }),
      () => Alert.alert('Not updated', 'Check your connection and try again.'),
    );
  const archive = (c: SecureConversation) => {
    const next = !c.archived;
    setPrefs(c, { archived: next });
    if (next) setUndo({ message: 'Archived', run: () => setPrefs(c, { archived: false }) });
  };
```

5. Long-press menu (`actions`) uses `setPrefs`/`archive` and gains Mute/Unmute: options `[pin, isMuted(c) ? 'Unmute' : 'Mute for 8 hours', archived ? 'Unarchive' : 'Archive', 'Chat details']`, mapping Mute → `setPrefs(c, { muted_until: muteUntil('8h') })`, Unmute → `setPrefs(c, { muted_until: null })`; call `haptic('medium')` when it opens.
6. `renderItem` wraps `ChatRow` in a swipeable with three actions:

```tsx
        renderItem={({ item: c }) => {
          const last = previews.data?.[c.id];
          const preview = chatRowPreview(last, {
            myUserId: userId,
            isGroup: c.kind === 'group',
            typingUserIds: typing[c.id] ?? [],
            nameOf: (uid) => memberName(c, uid),
            receipt: last ? receiptOf(last, userId, c.members) : undefined,
          });
          const muted = isMuted(c);
          const action = (label: string, icon: IconName, onPress: () => void, bg: string) => (
            <Pressable
              key={label}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={{ width: 72, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: bg }}
            >
              <Icon name={icon} size={20} color={cc.text} />
              <Text style={{ color: cc.text, fontSize: 12 }}>{label}</Text>
            </Pressable>
          );
          return (
            <ReanimatedSwipeable
              friction={2}
              rightThreshold={40}
              onSwipeableWillOpen={() => haptic('light')}
              renderRightActions={() => (
                <View style={{ flexDirection: 'row' }}>
                  {action(c.pinned ? 'Unpin' : 'Pin', 'pin', () => setPrefs(c, { pinned: !c.pinned }), cc.raised)}
                  {action(muted ? 'Unmute' : 'Mute', muted ? 'bell' : 'bell-off', () => setPrefs(c, { muted_until: muted ? null : muteUntil('8h') }), cc.strong)}
                  {action(c.archived ? 'Unarchive' : 'Archive', 'archive', () => archive(c), cc.lineStrong)}
                </View>
              )}
            >
              <ChatRow
                conv={c}
                myId={userId}
                title={conversationTitle(c, userId, nicknames.data)}
                preview={preview}
                time={formatRowTime(last?.createdAt ?? c.lastMessageAt, new Date())}
                online={/* unchanged */}
                onLongPress={() => actions(c)}
              />
            </ReanimatedSwipeable>
          );
        }}
```

(Keep the row's existing `online` expression. Full-swipe-to-archive: pass `onSwipeableOpen={(direction) => direction === 'left' && …}` only if the installed version reports a full swipe; otherwise the Archive button is the action — do not invent an API.)

7. Render `{undo && <UndoBar message={undo.message} onUndo={() => { undo.run(); setUndo(null); }} onDone={() => setUndo(null)} />}` as the last child of the screen `View`. (Wrap `onDone` in `useCallback` so the 5 s timer isn't reset on re-render.)
8. Add `useInboxTyping` to mobile `hooks.ts` (same body as the web Task 11 Step 3 hook).

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/thread.test.tsx` → PASS.
Run: `pnpm --filter @vybora/mobile test` and `pnpm --filter @vybora/mobile exec tsc -p tsconfig.json --noEmit` → pass / exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): chat rows with ticks, typing, badges, swipe actions and undo"
```

---

### Task 17: Mobile last seen, activity and reciprocal online status

**Files:**
- Modify: `apps/mobile/src/features/connect/hooks.ts`, `apps/mobile/src/features/connect/ConnectProvider.tsx`, `apps/mobile/src/app/messages/[id].tsx`, `apps/mobile/src/app/messages/index.tsx`, `apps/mobile/src/app/messages/privacy.tsx`

**Interfaces:**
- Consumes: `touchActivity`, `fetchLastSeen`, `qk.connect.lastSeen` (Task 5); `headerStatus` (Task 3).
- Produces: mobile `useLastSeen(peerId: string | undefined, enabled: boolean)` (same contract as web Task 12).

- [ ] **Step 1: Add `useLastSeen` to mobile `hooks.ts`**

```ts
/** A peer's last seen (null when hidden). Disabled while my own online status is off. */
export function useLastSeen(peerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.connect.lastSeen(peerId ?? ''),
    enabled: enabled && !!peerId,
    queryFn: async () => (await fetchLastSeen(supabase, [peerId!]))[peerId!] ?? null,
    refetchInterval: 60_000,
    retry: false,
  });
}
```

- [ ] **Step 2: Record activity in `ConnectProvider.tsx`**

```tsx
  // "Last seen": only recorded while the user shows their online status.
  useEffect(() => {
    if (!engine || !userId || !privacy.data?.show_online) return;
    const touch = () => {
      if (AppState.currentState === 'active') void touchActivity(supabase).catch(() => undefined);
    };
    touch();
    const timer = setInterval(touch, 120_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && touch());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [engine, userId, privacy.data?.show_online]);
```

(import `AppState` from `react-native`, `touchActivity` from `@vybora/api`.)

- [ ] **Step 3: Header and reciprocity in `app/messages/[id].tsx`**

```tsx
  const showOnline = !!privacy.data?.show_online;
  useEffect(
    () => (peerId && showOnline ? watchPresence(supabase, [peerId], (s) => setOnline(s.has(peerId))) : undefined),
    [peerId, showOnline],
  );
  useEffect(() => {
    if (!showOnline) setOnline(false);
  }, [showOnline]);
  const lastSeen = useLastSeen(peerId, showOnline && conv?.kind === 'direct' && !online);
  const subtitle = headerStatus({
    isGroup: conv?.kind === 'group',
    memberCount: conv?.members.length ?? 0,
    typingNames,
    online,
    lastSeenAt: lastSeen.data ?? null,
    now: new Date(),
  });
```

(replace the old presence effect and `subtitle`; after sending text call `if (showOnline) void touchActivity(supabase).catch(() => undefined);`.)

- [ ] **Step 4: Reciprocal dots in `app/messages/index.tsx`**

Add a privacy query (`fetchConnectPrivacy`, `qk.connect.privacy`) and gate the presence effect on `privacy.data?.show_online`, clearing `online` when off (same shape as web Task 12 Step 6).

- [ ] **Step 5: Privacy copy in `app/messages/privacy.tsx`**

Change the online toggle's label to `Show when I’m online and last seen` and its description to `Only people you share a chat with can see it. If you turn this off, you won’t see other people’s either.`

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @vybora/mobile test` → pass.
Run: `pnpm --filter @vybora/mobile exec tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): last seen in chat header, reciprocal online status"
```

---

### Task 18: Docs and full verification

**Files:**
- Modify: `docs/DESIGN_SYSTEM.md`, `docs/FEATURE_STATUS.md`, `docs/SECURITY.md`, `docs/CONNECT.md`, `CHANGELOG.md`

- [ ] **Step 1: Docs**

- `DESIGN_SYSTEM.md`: add a "Messenger patterns" section — runs (2/8 px spacing), tail (flat SVG notch, 4 px tailed corner), date chips (4 px radius, Plex Mono 11 px, sticky), unread divider, jump button (40/44 px, 8 px radius), badges (4 px radius, `99+`), message menu (reaction bar + actions), select mode; and an "Accessibility settings" section listing the six prefs, text sizes 13/15/17/20, the high-contrast token rules (7:1 / 4.5:1 / 3:1), per-device storage.
- `FEATURE_STATUS.md`: add rows for the new features with their real verification state (🟢/✅ only for what tests actually exercised); note last seen requires migration `20261015000012` on the hosted project.
- `SECURITY.md` and `CONNECT.md`: document `user_activity` (no client grants), `touch_activity` (server time, 60 s throttle, only while `show_online`), `last_seen` rules (shared chat, both sides showing, no blocks, minute precision, ≤ 100 ids), the reciprocal presence policy, and that accessibility prefs never leave the device.
- `CHANGELOG.md`: a dated entry summarising the layout, accessibility, last seen and the new dependency `@radix-ui/react-context-menu` 2.2.16.

- [ ] **Step 2: Full check**

Run: `pnpm check`
Expected: exit 0 — Prettier, ESLint, TypeScript, all tests (core, api, db incl. `last-seen.test.ts`, web, mobile), web build. Fix anything that fails and re-run; record actual counts.

- [ ] **Step 3: Playwright smoke**

Run: `pnpm test:e2e`
Expected: existing smoke tests pass; `messaging.spec.ts` stays skipped without `E2E_SUPABASE_*`. Record actual counts.

- [ ] **Step 4: Manual check in the browser preview (web)**

Start the dev server (`pnpm dev`), sign in, and verify with screenshots: tails and runs, sticky date chip, unread divider on opening a chat with unread messages, jump button, right-click menu, select mode, row menu + Undo toast, Settings → Accessibility (each toggle visibly changes the UI), light/dark × normal/high contrast. If signing in isn't possible in this environment, say so in the report rather than claiming it was checked.

- [ ] **Step 5: Commit**

```bash
git add docs CHANGELOG.md
git commit -m "docs: messenger layout, accessibility settings and last seen"
```

- [ ] **Step 6: Report**

Summarise to the user: what shipped per platform, exact test results, what was not verified (real devices, hosted DB), and that the migration needs `supabase db push` **after they review it and say so**.
