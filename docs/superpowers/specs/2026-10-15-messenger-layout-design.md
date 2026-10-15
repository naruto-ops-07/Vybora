# Messenger layout & accessibility — design

_Status: approved in conversation 2026-10-15, awaiting written-spec review. Project 1 of 3 ("like WhatsApp/Signal"): **layout → chat features → calls**. Features (edit, forward, star, in-chat search, link previews, web voice recording, view-once, group photos) and voice/video calls get their own specs._

## Goal

Make VYBORA's web and mobile apps feel as familiar to use as WhatsApp or Signal — through layout, gestures and behaviour — while keeping VYBORA's own brand and design rules, and add a per-device Accessibility settings page.

### Decisions already made

| Topic         | Decision                                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms     | Web **and** mobile in this project                                                                                                                                                                                                 |
| Design rules  | Kept: no pills, radii 4/8/12 only, no shadows, no gradients, Archivo + IBM Plex Mono, Phosphor icons. Familiarity comes from structure and behaviour, not from copying WhatsApp's look. No WhatsApp/Signal names, logos or colours |
| Architecture  | **Shared logic, native UI**: pure tested functions in `packages/core`; each app renders natively                                                                                                                                   |
| Last seen     | Added, **reciprocal** (hide yours → you can't see others'), only for people who share a chat with you                                                                                                                              |
| Accessibility | Settings → Accessibility page (per device) + always-on basics                                                                                                                                                                      |
| Out of scope  | Status/Stories, forward/edit/star, calls, voice-note captions (needs on-device speech-to-text; later)                                                                                                                              |

### Success criteria

1. Consecutive messages group into runs with a tail on the last bubble; date chips and a single unread divider appear in the right places on both platforms (same `layoutThread` output).
2. Swipe-to-reply, long-press/right-click message menu with reaction bar, and select mode work on mobile and web; every action is also reachable without gestures.
3. Chat rows show preview with ticks/sender, typing, unread badge, pin/mute; pin/mute/archive available by swipe (mobile) and context menu (web) with Undo for archive.
4. Direct-chat headers show typing / online / last seen under the privacy rules below, enforced server-side.
5. Settings → Accessibility exists on both platforms, every setting takes effect immediately and survives restart.
6. `pnpm check` passes; new DB, unit, component and Playwright tests pass (results reported as actually run).

## 1. Shared logic — `packages/core/src/chat/`

Pure TypeScript, no React/React Native, exported from `@vybora/core`, unit-tested in `core.test.ts` (or `chat.test.ts`).

### `layoutThread(messages, opts) → ThreadItem[]`

- **Input:** messages in ascending `seq` order (`LocalMessage`-compatible shape: `id, senderId, createdAt, seq`), `opts = { myUserId, lastReadSeq, now, timeZone? }`.
- **Output:** a flat list of items:
  - `{ type: 'date', key, label, date }` — "Today", "Yesterday", weekday for the last 6 days, otherwise "Mon 12 Oct" (year added when not current year).
  - `{ type: 'unread', key, count }` — at most one, placed before the first message with `seq > lastReadSeq` that is not mine. Omitted if none.
  - `{ type: 'message', key, message, mine, runStart, runEnd }`.
- **Run rule:** same `senderId`, `< 5 min` after the previous message, same local day, and no date/unread item between them.
- `runStart` → show sender name (groups, not mine). `runEnd` → tail + avatar (groups, not mine).

### `chatRowPreview(conv, last, opts) → RowPreview`

- `opts = { myUserId, typingUserIds, nameOf, isGroup }`.
- Returns `{ prefix: string | null, text: string, receipt: Receipt | null, typing: boolean }`.
- Rules: typing wins ("typing…" / "Maya is typing…" in groups); mine → prefix "You", receipt from last message; group + not mine → prefix sender's display name; attachment kinds → "Photo", "Video", "Voice message", "File: name"; deleted → "This message was deleted"; undecryptable → "Message couldn't be decrypted"; no message → "No messages yet". Never exposes content beyond the existing 140-char local preview.

### `formatLastSeen(at, now, timeZone?) → string`

"online" is decided by presence, not this function. Outputs: "last seen just now" (< 1 min), "last seen today at 14:05", "last seen yesterday at 09:12", "last seen Monday at 18:40" (≤ 6 days), "last seen 12 Oct" / "12 Oct 2025".

### `swipeReplyDecision({ dx, vx }) → 'idle' | 'armed' | 'trigger'`

Shared threshold: `dx ≥ 64` px → armed; release while armed or `vx ≥ 800` px/s with `dx ≥ 24` → trigger. Rightward only; vertical-dominant movement never arms.

### `formatRowTime(at, now)` and `formatUnread(n)`

Row time: "14:05" today, weekday this week, otherwise short date. Unread: "1"…"99", "99+".

## 2. Accessibility settings

### Storage

Per device; no database change. Shape `A11yPrefs` defined once in `packages/core` with defaults and a parser that ignores unknown/invalid values:

```ts
type A11yPrefs = {
  reduceMotion: 'system' | 'on' | 'off'; // default 'system'
  swipeToReply: boolean; // default true
  haptics: boolean; // default true (mobile only)
  textSize: 'sm' | 'md' | 'lg' | 'xl'; // default 'md' → 13/15/17/20 px base
  highContrast: boolean; // default false
  alwaysShowActions: boolean; // default false
};
```

- Web: `localStorage['vybora:a11y']`, read in try/catch; `A11yProvider` sets `data-contrast="high"`, `data-text-size`, `data-reduce-motion` on `<html>` and exposes `useA11y()`. Motion `MotionConfig reducedMotion` and Lenis follow the resolved value.
- Mobile: AsyncStorage key `vybora:a11y`; `A11yProvider` + `useA11y()`; resolved reduce-motion combines the setting with `AccessibilityInfo.isReduceMotionEnabled`.

### Page

Web: new `/settings/accessibility` route + entry in `SettingsNav` + command-menu item. Mobile: new `messages/accessibility` screen linked from Settings. Sections: **Motion & gestures** (reduce motion, swipe to reply, haptics — mobile only), **Text** (size with live preview bubble), **Display** (high contrast, always show message actions).

### Effects

- **Reduce motion:** no Lenis, no Motion transitions, drawer/tooltip/date-chip fades instant, swipe snap-back instant (direct manipulation still follows the finger).
- **Swipe to reply off:** pan gesture not attached.
- **Haptics off:** no `expo-haptics` calls.
- **Text size:** web — CSS variable `--vy-text-base` drives bubble, row and composer sizes; mobile — `scale` factor applied in `Text` component, stacking with system font scale; layouts wrap, never truncate message bodies.
- **High contrast:** third token set per theme in `packages/config` (light-hc, dark-hc): text ≥ 7:1 where possible, borders ≥ 3:1, incoming bubble solid with border, links underlined. Chat theme colours are overridden to the high-contrast accent.
- **Always show actions:** Reply / React / More visible on every message; web chat rows show a visible More button.

### Always-on basics

- Screen reader: each message is one accessible item ("Maya, 14:05, See you at 7, read"); date chips and the unread divider are headings; new incoming messages in the open, unmuted chat are announced via a polite live region (web) / `AccessibilityInfo.announceForAccessibility` (mobile).
- Web keyboard: ↑/↓ moves focus between messages (roving tabindex), Enter or Shift+F10 opens the message menu, R replies, Esc closes/backs out; focus restored after menus/dialogs; shortcuts listed in the command menu.
- Targets ≥ 44 × 44 px on mobile and touch web.
- Never colour alone: ticks labelled, badges numeric, failures say "Not sent".

## 3. Conversation view

- **Bubbles:** run spacing 2 px, between runs 8 px. Radius 12 px, tailed corner 4 px; tail is an inline SVG notch filled with the bubble colour (border-coloured stroke for incoming in light/high-contrast). Group avatar 28 px beside run end; sender name above run start.
- **Date chips:** flat, 4 px radius, bordered, Plex Mono 11–12 px. Web: CSS `position: sticky` per day section. Mobile (inverted FlatList): overlay chip driven by `onViewableItemsChanged`, fades 1.5 s after scrolling stops (instant under reduce motion).
- **Unread divider:** full-width rule with "N unread messages"; chat opens scrolled to it (otherwise to bottom).
- **Jump to latest:** 40 × 40 px square, 8 px radius, bordered, bottom-right, shown when > 1 screen from the end; shows new-message count (4 px radius badge). Accessible name "Jump to latest message, 3 new".
- **Swipe to reply:** mobile — `react-native-gesture-handler` Pan + Reanimated, `activeOffsetX [0, 12]`, `failOffsetY ±12`; reply arrow fades in proportionally; light haptic on `armed`; release on `trigger` → start reply. Web — pointer events on touch input only (`pointerType === 'touch'`), same decision function.
- **Message menu:** web — `@radix-ui/react-context-menu` (new dependency, same Radix family already installed) on each bubble (right-click, long-press on touch, Shift+F10/ContextMenu key); mobile — existing `MessageActions` sheet restyled. Content: reaction bar (existing `QUICK_REACTIONS`), then Reply, Copy (text only), Select, Delete for everyone (mine, deletable). Menu built from a shared action list so project 2 can add Forward/Edit/Star.
- **Select mode:** checkboxes beside messages; header becomes "N selected" with Copy and Delete for everyone (enabled only if every selected message is mine and deletable); Copy joins as `[HH:MM] Name: text` lines; Esc/Back exits; web Space toggles focused message.

## 4. Chat list rows

- Layout: 48 px avatar (+ online dot for direct chats, subject to reciprocal rule); line 1 name + `formatRowTime` (accent when unread); line 2 `chatRowPreview` (ticks inline for mine, accent "typing…"), pin and mute icons, unread badge (min 20 px, 4 px radius, accent; neutral when muted; "99+").
- Typing in list: inbox joins typing channels (`joinTypingChannel`) for the 20 most recently active conversations; leaves on unmount/re-rank.
- Actions: Pin/Unpin, Mute/Unmute, Archive (existing API). Mobile — `ReanimatedSwipeable` left swipe reveals the three; full swipe archives; long-press opens same actions + "Chat details". Web — Radix Context Menu on row (right-click, Shift+F10); visible More button when "always show actions" is on. Archive shows toast "Archived" with Undo (5 s).

## 5. Last seen (database)

New additive migration `supabase/migrations/20261015000012_last_seen.sql`:

```sql
create table public.user_activity (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- no grants to anon/authenticated: only the functions below touch it
```

- `public.touch_activity() returns void` — `security definer`, `search_path = ''`; upserts `now()` for `auth.uid()` only when the stored value is null or older than 60 s.
- `public.last_seen(p_user_ids uuid[]) returns table (user_id uuid, last_active_at timestamptz)` — `security definer`, `stable`; raises if more than 100 ids; returns `date_trunc('minute', last_active_at)` only for ids where:
  1. `public.shares_conversation_with(id)` (caller shares a chat), and
  2. the target's `user_settings.show_online` is true, and
  3. the **caller's** `user_settings.show_online` is true (reciprocal), and
  4. no row in `public.blocks` in either direction.
- Execute granted to `authenticated` only.
- Realtime policy "connect: presence read" is replaced (drop + create) to additionally require the caller's own `show_online = true` (self-topic always readable).

Clients:

- Call `touch_activity()` on app foreground / window focus, every 2 min while visible, and after sending a message. Failures ignored.
- Direct-chat header: typing → "typing…"; presence → "online"; else `last_seen([peer])` → `formatLastSeen`; else nothing. Re-query on focus and every 60 s while open.
- When the caller's `show_online` is off, apps hide online dots and skip last-seen queries.
- Privacy page copy: "Show when I'm online and last seen. If you turn this off, you won't see other people's either." Update `docs/SECURITY.md` and `docs/CONNECT.md`.

## Error handling

- Last-seen/touch RPC failures: silently show nothing; never block chat.
- Typing-channel join failures in the list: row falls back to the normal preview.
- Corrupt stored a11y prefs: fall back to defaults field by field.
- Gesture conflicts: vertical scroll always wins over swipe (`failOffsetY`).

## Testing

- **Core unit:** `layoutThread` (runs, 5-min gap, day boundary, time zones, unread divider placement/omission, groups vs direct), `chatRowPreview` (all kinds, typing precedence, groups), `formatLastSeen`/`formatRowTime` (boundaries, DST day), `swipeReplyDecision`, `A11yPrefs` parser.
- **DB (PGlite suite):** `touch_activity` throttle and self-only; `last_seen` member vs non-member, target setting off, caller setting off (reciprocal), blocked either direction, minute truncation, > 100 ids rejected, no direct table access; presence policy with caller setting off.
- **Web components:** Bubble tail/run rendering, context menu actions, select mode, row preview + badge, Accessibility page toggles applying `<html>` attributes.
- **Mobile components:** Bubble runs, inbox row preview, Accessibility screen persistence.
- **Playwright:** Settings → Accessibility persists across reload (text size, high contrast); keyboard opens message menu where a live session is available (skipped without `E2E_SUPABASE_*`).

## Files (expected)

- `packages/core/src/chat/{layout,preview,time,swipe,a11y}.ts` + tests; `packages/core/src/index.ts`.
- `packages/config/src/index.ts` (high-contrast tokens); `apps/web/src/styles/index.css` (hc tokens, text-size variable).
- `packages/api/src/connect.ts` (`touchActivity`, `lastSeen`).
- `supabase/migrations/20261015000012_last_seen.sql`; `supabase/tests` / db-tests additions.
- Web: `features/a11y/{A11yProvider,AccessibilityPage}.tsx`, `features/connect/{Bubble,ChatPane,InboxPane,MessageMenu,ChatRowMenu,SelectBar,JumpToLatest}.tsx`, router + `SettingsNav` + `CommandPalette`.
- Mobile: `src/features/a11y/A11yProvider.tsx`, `src/app/messages/accessibility.tsx`, `src/features/connect/ui/{Bubble,MessageActions}.tsx`, `src/app/messages/{index,[id]}.tsx`, settings link.
- Docs: `DESIGN_SYSTEM.md` (tails, chips, badges, high contrast, a11y prefs), `FEATURE_STATUS.md`, `SECURITY.md`, `CONNECT.md`, `CHANGELOG.md`.

## Rollout

Migration is additive (new table, two functions, one replaced Realtime policy). It is pushed with `supabase db push` only after the user reviews it and says so.
