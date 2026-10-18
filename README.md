# VYBORA

**Private messaging, end to end.** VYBORA is a privacy-focused messenger for the web, iOS and Android: every new conversation is end-to-end encrypted with MLS (RFC 9420), on one Supabase backend.

> Status: the codebase builds, type-checks and passes its automated test suites (details in [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)). It has **not** been deployed, run against a hosted Supabase project, run on physical devices, or independently security-audited.

## What's inside

| Area            | Highlights                                                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messaging       | End-to-end encrypted direct and group chats (MLS, [docs/CONNECT.md](docs/CONNECT.md)); multi-device; encrypted photos, videos, files and voice notes; replies, reactions, delete for everyone; delivered/read receipts, typing, presence; disappearing messages; paginated history; reconnect handling and retry |
| Trust & devices | Safety numbers and key-change warnings; linked devices with remove; sign out and erase this device; app lock (mobile)                                                                                                                                                                                            |
| Personalization | Private nicknames; per-chat tone, notifications and mute (1h / 8h / 1 week / always); pin and archive; shared chat theme + wallpaper synced to everyone, with a personal override                                                                                                                                |
| Privacy         | Receipts, typing and online status are opt-out; optional phone number with consent-based visibility; block and report; push notifications never contain message content                                                                                                                                          |
| Accounts        | Email sign-up with live username availability, verification, password recovery, session restore, profile and photo, account deletion                                                                                                                                                                             |
| Design          | Documented design system — Archivo + IBM Plex Mono, graphite/teal, flat, light and dark: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                                                                                                                                                                          |

The former social features (feed, stories, reels, profiles) and the staff admin console were removed from the apps on 2026-10-14 and archived in [archive/2026-10-14-social-ui](archive/2026-10-14-social-ui/README.md); their database tables are untouched. Chats from before encryption stay readable, read-only, under _legacy messages_.

## Architecture

```
apps/web        React 19 + Vite 7 + Tailwind 4 + React Router 7 + TanStack Query + Phosphor icons
apps/mobile     Expo SDK 57 (React Native 0.86) + Expo Router + Phosphor icons + bundled Archivo/IBM Plex Mono
packages/api         typed data-access layer shared by both clients (+ query keys, cache helpers, uploads)
packages/e2ee        VYBORA Connect engine: MLS groups (ts-mls), device identity, encrypted local store, attachments
packages/core        pure domain logic: text tokenizing, formatting, cursors, MIME sniffing, error copy
packages/validation  zod schemas mirroring DB constraints, env validation
packages/types       generated Database types (from migrations) + domain models
packages/config      design tokens + shared ESLint config
supabase/migrations  schema, RLS, storage policies, triggers, RPCs (11 migrations)
supabase/functions   delete-account, cleanup-media, send-push (Deno Edge Functions)
supabase/tests       RLS / storage / trigger tests on a real Postgres 17 (PGlite)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/CONNECT.md](docs/CONNECT.md) · [CHANGELOG.md](CHANGELOG.md)

## Prerequisites

- Node.js ≥ 20.19 (developed on Node 24) and pnpm 9 (`npm i -g pnpm@9`)
- For a local backend: Docker + [Supabase CLI](https://supabase.com/docs/guides/cli)
- For mobile: Expo Go or a development build; EAS account for store builds

## Getting started

```bash
pnpm install
```

### 1. Backend (local)

```bash
supabase start            # applies supabase/migrations, prints API URL + anon/service keys
```

Copy the printed values:

- `apps/web/.env.development.local` (dev; it outranks the committed `.env.development`) and `apps/web/.env.local` (builds) ← `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `apps/web/.env.example`)
- `apps/mobile/.env` ← `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

There is no admin console: nobody, including the operator, can read message content in the app or the database.

### 2. Web

```bash
pnpm dev                  # http://localhost:5173
```

If configuration is missing or invalid, the app shows a "Configuration required" screen listing the problem instead of failing silently.

### 3. Mobile

**Step-by-step phone setup (hosted Supabase + Expo Go, no Docker): [docs/RUNNING_MOBILE.md](docs/RUNNING_MOBILE.md).**

```bash
pnpm dev:mobile           # Expo dev server; press a / i, or scan with Expo Go
```

`expo-video`, `expo-notifications` and `expo-sqlite` work in Expo Go for development; push notifications require a development build with an EAS project id (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Workspace commands

| Command             | What it does                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm check`        | format check → lint → typecheck → all tests → builds                                                  |
| `pnpm test`         | unit, component, mobile (jest-expo) and database/RLS suites                                           |
| `pnpm test:db`      | only the database/RLS/storage-policy suite                                                            |
| `pnpm test:e2e`     | Playwright against the production web build (smoke always; social flows when `E2E_SUPABASE_*` is set) |
| `pnpm db:types`     | regenerate `packages/types/src/database.ts` from the migrations                                       |
| `pnpm db:status`    | list migrations applied on the linked Supabase project (`npx supabase@latest migration list`)         |
| `pnpm db:push`      | apply pending migrations to the linked project (`npx supabase@latest db push`; see DEPLOYMENT.md)     |
| `pnpm db:grants`    | write a new migration of explicit grants for the API roles (only when the drift guard asks for one)   |
| `pnpm brand:assets` | regenerate app icons / splash / PWA icons from the logo geometry                                      |
| `pnpm brand:tones`  | regenerate the original message tones (WAV) for web and mobile                                        |
| `pnpm build`        | production web build + type-checked packages                                                          |

## Environment configuration

Public values (URL, anon/publishable key, site URL) are safe in client bundles because every table and bucket is protected by RLS. **Never** put the service-role key in a `VITE_*` or `EXPO_PUBLIC_*` variable — it belongs only in Edge Function secrets and local scripts. See [.env.example](.env.example) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Database migrations

Migrations live in `supabase/migrations` and are applied in filename order. Workflow:

1. Add a new timestamped `.sql` file (never edit an applied migration).
2. `pnpm test:db` — runs every migration on a fresh Postgres and executes the RLS suite, with and without Supabase's old default privileges. Grant explicitly whatever a new object needs: hosted projects no longer add default grants, and the suite fails if a migration relies on them.
3. `pnpm db:types` — regenerate types; CI fails if they drift.
4. Review, then `pnpm db:push` to staging, then production (one-time CLI setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#one-time-setup)).

## Troubleshooting

- **"Configuration required" screen** — env file missing or values invalid; the screen lists which.
- **Uploads fail with 403** — the object path must start with your user id (Storage RLS); check you're signed in.
- **Email links don't open the app** — add `vybora://auth/callback` (and your web `/auth/callback`) to Auth → URL Configuration → Redirect URLs.
- **Metro can't resolve a workspace package** — run `pnpm install` from the repo root, then `npx expo start --clear`.
- **Duplicate React errors** — all workspaces must use the same React version (currently 19.2.3, pinned to Expo SDK 57).

## Known limitations

See [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md#known-limitations). Highlights: end-to-end encryption uses a standard protocol but has **not been independently audited**; no voice/video calls or message editing; no group photos; legacy (pre-encryption) chats are read-only and were never end-to-end encrypted; OAuth providers are not wired in.
