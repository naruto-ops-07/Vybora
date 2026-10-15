# Architecture

## Overview

```
 ┌───────────── apps/web (Vite SPA) ─────────────┐   ┌──────── apps/mobile (Expo) ────────┐
 │ React Router · TanStack Query · Tailwind      │   │ Expo Router · TanStack Query       │
 └──────────────────────┬────────────────────────┘   └─────────────────┬──────────────────┘
                        │        @vybora/api · core · validation · types · config
                        └───────────────┬───────────────────────────────┘
                                        │ supabase-js (user JWT)
        ┌───────────────────────────────┼─────────────────────────────────────┐
        │ Supabase                      ▼                                     │
        │  Auth (PKCE)   PostgREST ── Postgres 15+ (RLS on every table)       │
        │  Storage (avatars public · media private · dm private, RLS)         │
        │  Realtime (messages, notifications — RLS-filtered)                  │
        │  Edge Functions (service role): delete-account · cleanup-media ·    │
        │                                  send-push → Expo Push API          │
        └─────────────────────────────────────────────────────────────────────┘
```

## Key decisions

| Decision                                                                                                                                                            | Why                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **The database is the security boundary.** All authorization lives in RLS policies, column-level grants and `security definer` functions; clients are untrusted.    | Both apps and any third-party caller hit the same rules. Route guards are UX only.                                   |
| **Read models as SQL functions** (`feed_home`, `feed_explore`, `get_profile`, `my_conversations`, …) built on a `security_invoker` view (`post_cards`).             | One round trip per page (no N+1), keyset pagination, and RLS still applies because they run as the caller.           |
| **Counters maintained by triggers** (likes, comments, followers, posts, hashtag counts) with column grants preventing client writes, plus an admin repair function. | Constant-time counts on hot paths without trusting clients; drift can be repaired by `admin_recount_counters()`.     |
| **Atomic post creation** via `create_post` RPC + a _deferred constraint trigger_ requiring ≥1 media at commit.                                                      | A post can never exist without media, even if created by direct table insert.                                        |
| **Upload first, then create rows**; triggers verify the object exists in the caller's folder and its stored MIME type matches.                                      | No orphan rows. Orphan _objects_ (abandoned uploads) are swept after 24h by `cleanup-media`.                         |
| **Private media via short-lived signed URLs**, resolved through a batching cache (`createSignedUrlBatcher`).                                                        | Private-account content is never on a permanent public URL; a feed page needs one signing request, not one per post. |
| **Server-controlled timestamps** (`created_at`, story `expires_at`) set in triggers.                                                                                | Clients cannot backdate content or extend story lifetimes.                                                           |
| **Rate limits in BEFORE INSERT triggers** counting the caller's recent rows.                                                                                        | Enforced at a trusted boundary; a client-side counter would be trivially bypassed.                                   |
| **Generated types from migrations** (`scripts/gen-db-types.mjs` introspects a PGlite DB).                                                                           | No Supabase project needed to keep types exact; CI fails on drift. Compatible with `supabase gen types`.             |
| **pnpm `node-linker=hoisted`, single React version (19.2.3)**                                                                                                       | Expo's Metro/autolinking is most reliable hoisted; duplicate React breaks at runtime.                                |
| **Shared packages ship TypeScript source** (`main: src/index.ts`).                                                                                                  | Vite and Metro both transpile workspace TS directly; no package build step.                                          |

## Web app structure

```
src/app         providers + route table (lazy-loaded routes)
src/routes      landing, auth screens, 404, error boundary, setup screen
src/features    feed, posts, explore, reels, stories, messages, notifications, profile, settings, admin, auth
src/components  ui primitives (Button, Field, Dialog, Menu, Toast, Tabs, States, Avatar), media, layout
src/lib         env validation, supabase client, query client, media prep (sniff + downscale), theme, monitoring
```

Server state lives in TanStack Query. Optimistic likes/saves update every cached copy of a post (`updatePostEverywhere`) and roll back on error. Realtime is used only for the open conversation and the notification badge; both subscriptions are cleaned up on unmount.

## Mobile app structure

Expo Router file routes under `src/app`: `(auth)` stack, `(tabs)` (home, explore, create, reels, profile), and stack screens for posts, profiles, hashtags, stories, messages, notifications, settings and the `auth/callback` deep link. Sessions persist with the `expo-sqlite` localStorage shim (Expo's recommended adapter) and token refresh pauses in the background.

## Ranking (transparent, deterministic)

- **Following feed:** reverse-chronological; own posts + accepted follows − muted accounts.
- **Explore → Trending:** public accounts only, last 7 days, ordered by `like_count + 2 × comment_count`, then recency. Mirrored in `engagementScore()` for cursor creation.
- **Explore → Latest:** reverse-chronological public posts.
- **Suggested accounts:** popular public accounts you don't follow, excluding blocked/muted.

There is no ML recommender.
