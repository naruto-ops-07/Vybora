# Feature status

_Last updated: 2026-10-14 (session 4 — messaging-only product, design system, redesign)._

Legend: ✅ implemented & verified by automated tests · 🟢 implemented, type-checked/built, not exercised against a live backend · 🟡 partial · ⛔ not implemented

## Verification performed in this session

| Check                                                                               | Result                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (Prettier → ESLint → TypeScript → all tests → web build)               | ✅ exit 0                                                                                                                                                         |
| Database/RLS suite on real Postgres 17 (PGlite)                                     | ✅ 96/96 (incl. 23 Connect RLS/RPC, 11 real-engine E2EE flows, legacy read-only migration test)                                                                   |
| Unit + component tests (validation 21, core 21, api 10, e2ee 23, web 23, mobile 14) | ✅ 112/112                                                                                                                                                        |
| Playwright smoke vs production build (desktop Chrome + Pixel 7)                     | ✅ 24 passed — routes, redirects, removed routes 404, responsive at 375/768/1280/1680 px with no horizontal overflow, form validation, keyboard focus ring, fonts |
| Playwright messaging flows vs real Supabase (`messaging.spec.ts`)                   | ⏭ 5 skipped — no Supabase project/Docker on the dev machine                                                                                                       |
| Mobile JS bundles (`expo export` iOS + Android, Hermes)                             | ✅                                                                                                                                                                |
| Edge functions (`send-push`, `cleanup-media`) type-check                            | ⏭ not run — Deno is not installed                                                                                                                                 |
| Messaging between real devices / hosted Supabase                                    | ⛔ not performed (migrations 0009–0011 not pushed)                                                                                                                |
| Independent security review of E2EE                                                 | ⛔ not performed                                                                                                                                                  |

## Features

| Area                                                                                     | Web                                   | Mobile                    | Backend                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------- | -------------------------------------- |
| Sign up / sign in / sign out / session restore / password recovery                       | 🟢 (forms ✅)                         | 🟢 (sign-in ✅)           | ✅                                     |
| Protected routes                                                                         | ✅ smoke (redirect keeps destination) | 🟢 root auth guard        | ✅ RLS                                 |
| Encrypted direct + group chats, multi-device                                             | 🟢 ✅ components                      | 🟢 ✅ components          | ✅ RLS + real-engine flows             |
| Message history, ordering, pagination                                                    | 🟢 (load earlier, keeps scroll)       | 🟢 (latest 500 locally)   | ✅                                     |
| Replies, reactions, delete for everyone                                                  | 🟢 ✅                                 | 🟢                        | ✅                                     |
| Attachments (photo, video, file, voice), encrypted, ≤ 25 MB                              | 🟢 (drag & drop, paste; plays voice)  | 🟢 (records voice)        | ✅ private bucket                      |
| Receipts, typing, presence, reconnect banner, retry                                      | 🟢                                    | 🟢                        | ✅                                     |
| Safety numbers, key-change warning, linked devices, erase device                         | 🟢                                    | 🟢 ✅ verify screen       | ✅                                     |
| Nicknames, tones, notifications, mute, pin, archive                                      | 🟢                                    | 🟢                        | ✅                                     |
| Shared chat theme + wallpaper, personal override                                         | 🟢                                    | 🟢                        | ✅ compare-and-set                     |
| Disappearing messages                                                                    | 🟢                                    | 🟢                        | ✅ + purge job                         |
| Group admin: rename, add/remove, roles, admins-only settings, leave                      | 🟢                                    | 🟢 (rename not on mobile) | ✅                                     |
| Profile (name, photo, about), account deletion                                           | 🟢                                    | 🟢                        | ✅                                     |
| Privacy: receipts/typing/online, sender in notifications, phone visibility, blocked list | 🟢                                    | 🟢                        | ✅                                     |
| Legacy (pre-encryption) chats                                                            | 🟢 read-only + "continue encrypted"   | 🟢 read-only              | ✅ sends blocked server-side (0011)    |
| Light / dark theme, keyboard shortcuts, reduced motion                                   | 🟢 ✅ focus                           | 🟢 system theme           | —                                      |
| Push notifications (no content, per-chat tones)                                          | n/a                                   | 🟢 (dev/store build)      | 🟢 `send-push`                         |
| Voice / video calls                                                                      | ⛔                                    | ⛔                        | ⛔ needs a media server                |
| Group photo                                                                              | ⛔                                    | ⛔                        | ⛔ needs a private group-avatar bucket |

Removed from the apps (archived, database unchanged): feed, explore, reels, stories, posts, follower profiles, notifications feed, admin console — see [archive/2026-10-14-social-ui](../archive/2026-10-14-social-ui/README.md).

## Known limitations

- **Encryption** is not independently audited (nor is the `ts-mls` library). See [CONNECT.md → Limitations](CONNECT.md#limitations).
- **No calls, message editing, group photos, custom uploaded tones, or contact sync.**
- **New devices** see only messages sent after they were added.
- **Web** does not record voice notes (it plays them). Web key storage is weaker than the phone keychain.
- **Mobile history** shows the newest 500 locally stored messages per chat (no "load earlier" yet).
- **Reports** are stored in the database but there is no in-app review console; the operator reviews them with SQL.
- **App Store export compliance**: `ITSAppUsesNonExemptEncryption` is `false` in `app.json`. Now that the app implements end-to-end encryption this must be reviewed before submission.
- **Usernames are searchable** by any signed-in user (needed to start chats); there is no discoverability opt-out yet.

## Next steps

1. Push migrations 0009–0011 to a staging project, disable public Realtime channel access, deploy `send-push` and `cleanup-media`.
2. Run `pnpm test:e2e` with `E2E_SUPABASE_*` set (enables `messaging.spec.ts`), then test two phones and a browser.
3. Commission an independent security review; settle App Store encryption export compliance.
4. Calls: choose a media server (e.g. LiveKit) and design call key exchange.
