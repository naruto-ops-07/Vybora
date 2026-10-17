# "Your circle, in colour" — design spec

_2026-10-17. Product designer: Claude (impeccable). Owner approved the direction ("Yes, build it"). Product truth: `apps/web/PRODUCT.md`. Direction contract: `apps/web/.impeccable/surfaces/apps-web-src-features-connect-workspace-tsx.md`. Also finishes the friends feature (spec `2026-10-16-friends-design.md`, Task 4 items listed at the end)._

## Rules that still bind (owner, re-confirmed)

Flat; midnight graphite + deep teal with turquoise/emerald accents; Archivo + IBM Plex Mono; **no gradients, no drop shadows, no pill-shaped controls, no hover lift/scale, no gratuitous animation**; radii 4/8/12 only; Phosphor icons; sentence case; ≥ 44 px touch targets; light/dark/high contrast; reduced motion (setting + system) disables every animation below; per-device text size honoured. No invented claims, users, testimonials. E2EE truth: no message text in any new surface outside the chat itself.

## 1. Personal tones (people are the colour)

**Mechanism:** `personTone(userId: string): ToneName` in `packages/core` — FNV-1a 32-bit hash of the user id, mod 8, into `PERSON_TONES = ['turquoise','emerald','lime','aqua','sky','mint','ocean','glacier']`. Stable across devices and sessions. Unit-test determinism and distribution (10k random uuids → every tone 9–16 %).

**Tokens** in `packages/config` (`personTones: Record<ToneName, { dark: {fill, ink, name}; light: {fill, ink, name} }>`), mirrored as CSS variables on web (`--vy-tone-<name>-fill|ink|name`, switched by theme) and consumed directly on mobile:

| Tone      | dark fill / name | light fill | light name (text) |
| --------- | ---------------- | ---------- | ----------------- |
| turquoise | #2DD4BF          | #99F6E4    | #0F766E           |
| emerald   | #34D399          | #A7F3D0    | #047857           |
| lime      | #A3E635          | #D9F99D    | #4D7C0F           |
| aqua      | #22D3EE          | #A5F3FC    | #0E7490           |
| sky       | #38BDF8          | #BAE6FD    | #0369A1           |
| mint      | #6EE7B7          | #D1FAE5    | #065F46           |
| ocean     | #60A5FA          | #BFDBFE    | #1D4ED8           |
| glacier   | #A5B4FC          | #E0E7FF    | #4338CA           |

- `ink` (initials on fill): dark theme `#0A0E0F` on every fill; light theme = that tone's light `name` colour.
- Contrast test in core (like the high-contrast test): dark name on `#1B2528` (bubble-in) and `#0F1517` (surface) ≥ 4.5:1; light name on `#FFFFFF` and `#EDF2F2` ≥ 4.5:1; ink on fill ≥ 4.5:1 both themes. Adjust a hex only if a test fails, and record it.
- **High contrast:** sender names use the theme's text colour (bold) instead of tones; avatar fills keep tones (ink-on-fill already ≥ 7:1 in dark; verify light, darken ink if needed).

**Where tones appear (and nowhere else):** avatar fallback fill + initials; group-chat sender names above runs (replacing the single accent colour); `@mentions` if rendered; friend rows/request rows avatars; the handle card's own avatar. Never on chrome, buttons or backgrounds.

**Avatars:** photo when present (unchanged); otherwise a flat circle (avatars are content; circles allowed) with tone fill and 1–2 initials (from display name, else username), Archivo semibold, size-proportional. **Group avatar:** two overlapping member avatars (first two other members, stable order by id), back one offset up-left, front one down-right, front with a 2 px ring in the surface colour (a border, not a shadow); a third member count chip only when > 2 members is not needed.

## 2. Illustrations and empty states

Author four flat SVG illustrations as components (web `apps/web/src/components/illustrations/`, mobile `apps/mobile/src/components/illustrations/` via react-native-svg), drawn in one grammar: graphite line (`currentColor` = muted text) at 1.5 px stroke with round caps, 2–3 flat fills from the tone palette + accent, corner radii 8–12, no gradients/shadows, ~160–200 px wide, `aria-hidden`. They must read as VYBORA (speech bubbles with tails like our bubbles, a lock "seal"), not stock icon tiles.

1. **Welcome** — two overlapping chat bubbles (our tail shape), the front one sealed with a small lock, three tone dots like people.
2. **No chats** — an open envelope with a bubble rising out of it, lock seal on the flap.
3. **No friends** — three avatar circles in tones joined by a curved line, the third dashed (empty seat) with a plus.
4. **Nothing found** — a bubble with a magnifier overlapping its corner.

Empty-state composition (web + mobile): illustration, heading (Archivo semibold, `type-wide` on web), one sentence, primary action, optional secondary. Copy:

- Content-pane welcome (no chat selected): "Pick a chat, or start one" / "Messages here are sealed on your device before they're sent." / primary "Add a friend", secondary "New message"; includes the HandleCard below.
- Empty inbox: "No chats yet" / "Add a friend by their username, then say hi." / "Add a friend" · "New message".
- Friends empty: "Your circle starts here" / "Share your username or add someone by theirs." + HandleCard.
- Search no results: "No one by that name" / "Check the spelling, or add them by username."

## 3. First run: "Get started"

A panel at the top of the chat list (web InboxPane, mobile inbox list header) shown until all steps are done or the user dismisses it; dismissal stored per device per user (`vybora.onboarding.<userId>`; localStorage / SecureStore). Three steps, each a row with a check state (Phosphor `CheckCircle` filled in accent when done, empty circle otherwise; never colour alone — done rows also get "Done" sr-only text and a strike-free muted label):

1. **Share your username** — inline HandleCard compact variant; done once the user has copied or shared it (stored).
2. **Add a friend** — button → `/friends` (focus input); done when friends ≥ 1 or an outgoing request exists.
3. **Say hi** — done when any secure chat has a message from me (use inbox previews / lastMessage sender).

Header: "Get started" + "2 of 3" (Plex Mono) + dismiss (X, "Hide getting started"). When all three complete, the panel shows "You're all set" for that session then never again.

## 4. Shareable username

`HandleCard`: own avatar (tone), display name, `@username` (Plex Mono), **Copy** (→ "Copied" for 2 s, announced) and **Share** (web: `navigator.share` when available, else copies the link; mobile: `Share.share`). Link: `${siteUrl}/friends?add=<username>` (web `VITE_SITE_URL`; mobile uses the same public web URL from its env, falling back to just the @handle text). Web `/friends?add=maya` prefills the add field and focuses it — never auto-sends; signed-out visitors go through login and return (RequireAuth already preserves destination). Mobile `messages/friends?add=` param prefills likewise.

## 5. Delight moments (only two)

**Sealed send** (web Composer send button, mobile Composer send button): on a successful send tap/Enter, the paper-plane glyph is replaced by a lock whose shackle closes (shackle translateY −3 px → 0 and body fade-in), 320 ms total, exponential ease-out, then returns to the plane. Opacity/transform only. `aria-label` unchanged; no announcement. Disabled entirely under reduced motion. Haptic (mobile) light, respecting the Haptics setting.

**Friendship joined:** when a request is accepted (by me, or `send` returns `accepted`): a card at the top of the Friends pane/screen — my avatar and theirs start 16 px apart and slide to overlap (280 ms), text "You and {name} are now friends", primary "Say hi" (opens/creates the direct chat), dismiss X. Under reduced motion they start overlapped. One card at a time (latest wins). Mobile: medium haptic once.

## 6. Polish in the workspace

- Chat list rows: unread name weight, accent time, tone avatar; selected row uses `surface-strong` + 2 px accent edge already present — keep; typing text in the friend's tone? **No** — typing stays accent (tones are identity, not status).
- Group sender names in bubbles: tone `name` colour (HC: text colour, bold).
- `Segmented`, buttons and inputs unchanged.
- Theme browser surfaces: `::selection` uses accent-soft (exists); scrollbar thin (exists); caret-color accent on inputs.

## 7. Dev-only design gallery (for visual verification)

Web route `/__gallery` registered **only when `import.meta.env.DEV`** (never in production bundles — verify with a build grep). It renders the real presentational components with synthetic sample data (labelled "Sample data" at top): personal tone grid (8 avatars + names on surface and bubble-in), group avatars, a chat-list column (extract a presentational `ChatRowView` from InboxPane so the gallery and InboxPane share it), a thread with runs/tails/group names/reactions/receipts, the composer with a "Play sealed send" button, friends rows + request rows + the joined card (with a replay button), all four empty states, the Get started panel in 0/3, 2/3, done states, the HandleCard. A theme switch (light/dark) and a high-contrast toggle at top. No network, no auth, no engine (mock what's needed via props/providers).

A Playwright script (not part of the test suite) `apps/web/scripts/gallery-shots.mjs` captures `/__gallery` at 1440×900 and 390×844 in light, dark and dark+HC into `.impeccable/review/` (`desktop.png`, `mobile.png`, `desktop-light.png`, `desktop-hc.png`), plus the landing page.

## 8. Friends Task 4 items (carried from reviews)

Web: FriendsPane presence watches only friends with a direct chat (inbox cache via `peerOf`); PrivacyPage `set()` `cancelQueries` before the optimistic write; Retry button `touch-target`; sr-only long form for relative times; drop duplicate accessible names (section vs list); new-message quick-pick capped at 8, ordered by most recent chat activity then name, "Show all friends (N)". Mobile: Settings `useFriendRequests(useIsFocused())`; AddFriendForm success haptic only for `sent`/`accepted`. Shared: `FriendRequestResult` single source (core; api re-exports). Landing: features strip gains "Friends by username" (Phosphor `UserPlusIcon`; body: "Add people by their exact username. Choose whether only friends can start chats with you.") with the grid rebalanced for six items.

## Build order (subagent-driven, each reviewed)

1. Tones + avatars + group sender names + `ChatRowView` extraction + gallery skeleton (web, core, config).
2. Illustrations + empty states + Get started + HandleCard + `?add=` prefill + friends Task 4 web items (web).
3. Sealed send + friendship joined + gallery sections + landing friends feature (web).
4. Mobile parity for 1–3 + friends Task 4 mobile items.
5. Docs/CHANGELOG, `pnpm check`, Playwright, gallery screenshots, design detector, finish review, DESIGN.md.
