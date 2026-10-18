# Changelog

## 2026-10-17 — Friends by username, and "Your circle, in colour"

### Database

- New migration `20261016000013_friends.sql`: tables `friend_requests` and `friendships` (`user_low < user_high`), both with RLS on and every client grant revoked. Clients use only `security definer` RPCs with `search_path = ''` that act as `auth.uid()`: `send_friend_request(username)` → `sent | accepted | already_friends | already_sent`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `my_friends()`, `my_friend_requests()`, `are_friends`.
  - Unknown, inactive and blocked users all get the same `user_not_found`.
  - At most 100 pending outgoing requests.
  - Blocking someone removes the friendship and any requests either way.
  - `message_privacy` gains `'friends'` ("only friends can start chats with me"); the legacy `'following'` branch now applies only to that value.
- **Not pushed** to the hosted project (nor is 0012). Review it first, then run `supabase db push`.

### Core, config and API

- `packages/api/src/friends.ts` (friend RPCs, query keys `qk.connect.friends` / `friendRequests`); `FriendRequestResult` has one source in core.
- Personal tones: `personTone(userId)` (FNV-1a, 8 tones) and `initialsFor` in core; `personTones` light/dark tokens in config, with contrast tests.
  - Lime light name `#3F6212`.
  - Light initials one step darker for turquoise, emerald, aqua and sky (the spec values failed 4.5:1).
- Onboarding rules (`getStartedProgress`, `friendInviteLink`, `usernameFromAddParam`, `orderQuickPick`), and the sealed-send timeline (`SEAL_MS`, `sealFrame`) shared by web and mobile.

### Web

- Friends pane (`/friends`): add by exact username with an inline message per outcome; requests with Accept / Decline / Cancel (optimistic, rolled back item by item); friends with Message and Remove; an incoming-request badge on the rail and the bottom nav; "Add a friend" in the command palette.
- Privacy → "Who can start chats with me": Everyone / Friends only.
- New-message quick-pick: friends by most recent chat, the first 8 then "Show all friends (N)".
- People are the colour: avatar fallbacks and group sender names in each person's tone (high contrast uses bold text instead). Group avatars show two overlapping members.
- Four flat illustrations and illustrated empty states: welcome, no chats, no friends, nothing found.
- "Get started" panel (share your username → add a friend → say hi; stored per device and per user).
- HandleCard: copy `@username`, or share a `/friends?add=` link; the link only prefills, it never sends.
- Sealed send (320 ms, the plane gives way to a closing lock) and friendship joined (avatars slide together, "Say hi"). Both are off under reduced motion.
- `cn()` now merges with `tailwind-merge` 3.7.0; caller overrides win (the flips were checked and recorded).
- Sign-up keeps `?next=`. An emailed confirmation returns there only for the account that signed up on this device. `safeNext` rejects control characters and backslashes.
- Landing: a "Friends by username" feature, in a grid of six.
- Message hover bar never covers sender names or neighbouring messages.
- Dev-only `/__gallery`, with `scripts/gallery-shots.mjs` for screenshots. It is never in production builds.

### Mobile

- Friends screen (inbox header button with badge, also reachable from Settings), the privacy choice, and a new-chat quick-pick ordered and capped like web, with an illustrated no-results state.
- Same tones, group avatars and sender names; the same four illustrations (react-native-svg); empty states; Get started (SecureStore); HandleCard (clipboard and the share sheet).
  - The share sheet carries the `?add=` link only when `EXPO_PUBLIC_SITE_URL` is set, otherwise just the `@handle`.
  - `messages/friends?add=` prefills the field.
- Sealed send with Reanimated (sampled from the shared timeline) and a light haptic on success; friendship joined with a medium haptic once. Both respect reduced motion and the Haptics setting.
- Compact buttons keep a 44 px touch area (`hitSlop`).

### Not verified

- No device or simulator run of the mobile changes. No signed-in browser run against a real backend: test accounts on the hosted project weren't available. The gallery screenshots cover web only.

## 2026-10-15 — Messenger layout, accessibility settings and last seen

### Database

- New migration `20261015000012_last_seen.sql`: table `user_activity` (RLS on, no client grants); `touch_activity()` (server time, 60 s throttle); `caller_shows_online()`; `caller_blocked_with(uuid)`; `last_seen(uuid[])` (shared chat, both sides showing online status, no block either way, minute precision, rejects more than 100 ids and multi-dimensional arrays). The presence read policy is replaced: reading someone else's presence now requires your own `show_online` on and no block either way.
- **Not pushed** to the hosted project. Run `supabase db push` only after reviewing the migration.

### Core and config

- `layoutThread` (runs, date chips, unread divider; optional `unreadUntilSeq`), messenger time wording, row previews and receipts, header status, message actions, swipe rule, accessibility prefs model (`vybora.a11y`) and `highContrastThemes` tokens.

### Web

- New dependency: `@radix-ui/react-context-menu` 2.2.16.
- Message runs with tails, sticky date chips per day, unread divider frozen when the chat opens, jump to latest, new-message announcements, keyboard navigation.
- Message menu (reaction bar, right-click context menu, hover bar hidden on coarse pointers unless "Always show message actions"), select mode, swipe to reply on touch.
- Chat rows with ticks, sender, typing, badges and a row menu with an Undo toast (the existing 7 s action toast, not the 5 s in the spec).
- Settings → Accessibility: reduce motion, swipe to reply, text size (13/15/17/20 px), high contrast, always-visible actions.
- Last seen in the chat header and reciprocal online status; activity is recorded only while your own online status is on, and last seen (including cached values) is hidden when it is off.

### Mobile

- Same runs, tails, date chips, unread divider and jump to latest; swipe to reply with haptics; `MessageActions` sheet with Select; select mode.
- Chat rows with swipe actions (`ReanimatedSwipeable`, Archive button; no full-swipe because the installed version has no full-swipe signal) and a safe-area-aware 5 s `UndoBar`; bubble and row accessibility actions ("Open photo" is not implemented).
- Settings → Accessibility; preferences are kept in `expo-secure-store` under `vybora.a11y` (the spec said AsyncStorage / `vybora:a11y`).
- Last seen in the chat header, reciprocal online status.

### Deviations from the spec

- Undo toast lasts 7 s on web (existing toast) and 5 s on mobile.
- Mobile preferences use `expo-secure-store`, key `vybora.a11y`.
- The chat header fallback stays "end-to-end encrypted" instead of being empty.

### Fixed

- Unread divider grew as new messages arrived while a chat was open (both apps now freeze `lastReadSeq` / `lastSeq` at open).
- `last_seen` array cap could be bypassed with a nested array (now counted with `cardinality()`); presence is no longer readable across a block.

### Not verified

- No real device, no hosted Supabase, no signed-in browser session (no test credentials), Hermes `Intl.DateTimeFormat.formatToParts` behaviour, the coarse-pointer CSS rule, and the visual rendering of tails and date chips were not checked.

### Tests (from this session's runs)

- `pnpm check`: exit 0 on the final run — DB 106/106 (incl. `last-seen.test.ts` 10), unit/component 209/209 (validation 21, core 52, api 13, e2ee 23, web 60, mobile 40), format, lint and types clean, web build OK. The first run failed once on a 5 s timeout in the mobile `a11y.test.tsx` under parallel load; the suite passes alone and on the re-run.
- Playwright: 24 passed, 5 skipped (`messaging.spec.ts` requires `E2E_SUPABASE_*`).
- `.prettierignore` now also skips tooling folders installed into the repo (`.github/agents`, `.github/hooks`, `.github/skills`, `.impeccable`).

## 2026-10-15 — Premium web pass

### Database

- `supabase db push` against the linked project (`skznrtrmclumubgtgznm`): remote already up to date, all 11 migrations (`20261009000001` … `20261014000011`) applied. Nothing was pushed.

### Web

- New libraries: `motion`, `lenis`, `cmdk`, `@radix-ui/react-accordion`, `@radix-ui/react-tooltip`. Archivo now loads its width axis (62–125) for an expanded display voice (`.type-display`, `.type-wide`).
- Landing rebuilt: hero with a live in-browser sealing demo (throwaway AES-GCM key, clearly labelled as an illustration, not MLS); scroll-driven "How a message travels" diagram; workspace preview; FAQ; closing call to action.
- Command menu (Ctrl/⌘ K) in the messaging workspace: chats, new message, settings, theme.
- Radix tooltips with shortcuts replace native `title` tooltips on icon buttons (new message, details, attach); the details drawer slides in on smaller screens.
- `apps/web/.env.local` created with the project values (used by builds; see Fixed for the dev-mode file).

### Fixed

- The "new message" signal never reset, so the dialog reopened whenever the chat list remounted.
- Sign-in and sign-up reported "You appear to be offline" in `pnpm dev`: Vite ranks the committed `.env.development` (local-stack placeholder) above `.env.local`, so the project URL was ignored. Local values now live in the git-ignored `apps/web/.env.development.local`; README and the `.env.development` comment updated.
- Buttons nested inside links (landing, auth, not-found and error pages) replaced by `ButtonLink`, a single link styled as a button, so screen readers and keyboard focus see one control.

### Tests (from this session's runs)

- `pnpm check`: exit 0 — DB 96/96, unit/component 112/112 (validation 21, core 21, api 10, e2ee 23, web 23, mobile 14), format, lint and types clean, build OK.
- Playwright: 24 passed, 5 skipped (`messaging.spec.ts` requires `E2E_SUPABASE_*`). The landing smoke test now targets the first of the two "Create your account" links.

## 2026-10-14 — Messaging-only product, design system and redesign

### Product scope

- VYBORA is now a private messaging app. Feed, explore, reels, stories, posts, follower profiles, the notifications feed and the staff admin console were removed from web and mobile and **archived** (not deleted) in `archive/2026-10-14-social-ui/`. No database tables, data or migrations were removed.
- Legacy (pre-encryption) DMs are **read-only**: new migration `20261014000011_legacy_dm_read_only.sql` revokes the insert grant on `messages` and `start_direct_conversation`. Each legacy chat offers "Continue in encrypted chat".

### Design system (docs/DESIGN_SYSTEM.md)

- New tokens in `packages/config` and `apps/web/src/styles/index.css`: midnight graphite + deep teal, turquoise/emerald accents, light and dark themes, all text pairs ≥ 4.5:1.
- Archivo (interface) + IBM Plex Mono (timestamps, counts, labels, safety numbers) on web (Google Fonts) and mobile (bundled via `expo-font`).
- Phosphor icons replace Lucide (web) and Feather (mobile). No gradients, shadows, lift/scale hover, or pill controls; three radii (4/8/12) enforced by Tailwind theme overrides.
- Chat themes are now flat bubble colours (Teal default) with separate dark/light accents; wallpapers are flat patterns. New brand mark and regenerated app/web icons.

### Web

- One messaging workspace: navigation rail · list pane (chats, settings or legacy list) · content · details. Phones show one pane at a time with a bottom bar. Settings (Profile, Privacy & security, Account) live inside the workspace.
- Redesigned landing (with an honest "what our servers can see" section), auth screens, inbox, chat, details, verification, privacy and account pages.
- Message pagination ("Load earlier messages", keeps scroll position); empty-history state; clearer offline and failure messages.

### Mobile

- Chats is the home screen (tab bar removed); new Settings screen; root auth guard for every protected route.
- `components/Icon.tsx` (per-icon Phosphor imports) and `components/Text.tsx` (weight → Archivo file) replace vector-icons and raw RN text; Connect UI follows the system light/dark theme.

### Fixed

- Decrypted attachment URLs were revoked 5 minutes after a bubble unmounted while the cache kept serving them, breaking images when a chat was reopened.
- Text inputs suppressed the focus outline (`focus:outline-none`); keyboard focus is visible again.
- Opening a just-created chat could redirect to the legacy page while the inbox was refetching (web and mobile).
- Phosphor's `title` prop renders an SVG text node that React Native rejects; labelled icons now use an accessible wrapper.
- Stale npm-installed copies of React 19.3 / react-native-svg in `apps/mobile/node_modules` (left by an interrupted install) shadowed the workspace versions.
- Baseline `pnpm check` failed on Prettier because `.claude/` tooling files were checked; they are now ignored.

### Tests (from this session's runs)

- `pnpm check`: exit 0 — DB 96/96, unit/component 112/112 (validation 21, core 21, api 10, e2ee 23, web 23, mobile 14), lint and types clean, web build OK.
- Playwright: 24 passed (smoke on desktop + Pixel 7, incl. four viewport sizes); 5 skipped (new `messaging.spec.ts`, requires `E2E_SUPABASE_*`).
- `expo export` Android and iOS: OK.
- Not run: real-backend messaging E2E, device testing, Deno check of edge functions.

### Upgrade / rollback

```bash
pnpm install
npx supabase@latest db push      # applies 0011 (and 0009–0010 if not yet applied)
```

Rollback: redeploy previous clients; to re-enable legacy sending run the grants in the header of migration 0011; restore archived screens from `archive/`.

## 2026-10-09 — VYBORA Connect (end-to-end encrypted messaging)

New conversations on web, iOS and Android are now end-to-end encrypted with MLS (RFC 9420). Design, threat model and limitations: [docs/CONNECT.md](docs/CONNECT.md).

> Not independently audited. Do not market as "Signal-equivalent" until a security review has been completed.

### Added

- **`packages/e2ee`** — `ConnectEngine`: per-device identity, one-time key packages, MLS direct/group chats (`ts-mls` 1.6.4, ciphersuite `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`), signed inner payloads, encrypted attachments (XChaCha20-Poly1305), exactly-once retries, membership self-healing, TOFU key pinning + safety numbers, disappearing messages, encrypted-at-rest local store. A WebCrypto adapter over audited noble primitives for Hermes and older browsers, selected by feature probe.
- **Database** — migration `20261010000009_connect.sql` (additive): `devices`, `key_packages`, `mls_envelopes`, `mls_welcomes`, `conversation_preferences`, `contact_nicknames`, `contact_methods`; new columns on `conversations`, `conversation_members`, `user_settings`; RPCs `claim_key_packages`, `create_secure_conversation`, `post_commit`, `ack_conversation`, `set_conversation_theme`, `set_disappearing_messages`, group admin RPCs, `get_contact_phone`, `my_secure_conversations`, service-role `should_push_message` + `purge_expired_envelopes`; private `connect` bucket; realtime authorization for private channels.
- **Database** — migration `20261010000010_connect_device_privacy.sql` (additive): device labels, platform and last-seen times are readable only by the owner (`my_devices()`); others see only public identity keys and revoked status.
- **Web** — 3-pane Messages (inbox · chat · details) with filters, search, pin/archive, presence, typing, receipts, replies, reactions, delete for everyone, drag-and-drop/paste encrypted uploads, image viewer, shared theme & wallpaper picker, personal override, per-chat tone/mute/notifications, disappearing messages, group admin, safety-number dialog, Privacy & security page (linked devices, receipts/typing/online toggles, sender-in-notifications, phone visibility, blocked accounts, erase this browser). Keyboard shortcuts: Alt+N, /, Alt+↑/↓, Alt+I, Esc. IndexedDB storage sealed with a non-extractable key; single-tab engine lock. The crypto bundle is lazy-loaded only when Messages opens.
- **Mobile** — encrypted inbox, chat, details, new chat/group, verify, and privacy screens; voice notes; app lock (biometrics); SQLite store keyed from Keychain/Keystore; per-tone Android notification channels and bundled iOS sounds.
- **Tones** — five original message tones generated by `scripts/generate-tones.mjs` (`pnpm brand:tones`).
- **Docs** — `docs/CONNECT.md`; updates to `SECURITY.md`, `FEATURE_STATUS.md`, `README.md`.

### Changed

- New chats (profile "Message" button, new-message dialogs) always create encrypted conversations. Pre-existing plaintext DMs remain available under **Messages → legacy messages** (`/messages/legacy`); old notification links redirect there automatically.
- `send-push` gates message pushes with `should_push_message` (global/per-chat notifications, mute), maps the per-chat tone to sound/channel, and sends only "New message" or "New message from {name}" — never content.
- `cleanup-media` also purges expired disappearing-message envelopes (their encrypted attachments are queued for deletion).
- `my_conversations()` / `unread_counts()` exclude encrypted chats from the legacy list and count encrypted unread messages (muted chats excluded).

### Fixed

- `isMuted()` treated "muted until I turn it back on" (`infinity`) as not muted.

### Tests (results from this session's `pnpm check`)

- Database/RLS (real Postgres 17 via PGlite): **95/95**, incl. 23 Connect RLS/RPC tests and 11 end-to-end flows with real engines (server never stores plaintext, third parties denied, retry without duplicates, tampering, revocation, group removal, encrypted local history).
- Unit/component: validation 21, core 21, api 10, e2ee 23, web 28, mobile 16 — **119/119**.
- Lint 0 errors/0 warnings, strict TypeScript in all workspaces, Prettier clean, web production build, `expo export` for Android and iOS (Hermes).
- **Not run:** Playwright (not re-run), Deno type-check of edge functions (Deno not installed), real-device messaging against a hosted project, independent security review.

### Upgrade

```bash
pnpm install
npx supabase@latest db push                       # applies migrations 0009 and 0010
npx supabase@latest functions deploy send-push cleanup-media
```

Then in the Supabase dashboard → Realtime → Settings, disable public channel access. No new environment variables. Restart Expo (`pnpm dev:mobile`); custom notification sounds and the new Android channels need a development/store build.

### Rollback

Redeploy the previous web build and mobile release, and the previous edge functions. The migrations are additive and can stay. Removing them requires a new down migration (see [CONNECT.md → Roll back](docs/CONNECT.md#roll-back)); dropping the Connect tables or bucket permanently destroys encrypted conversations. Never reset the production database.
