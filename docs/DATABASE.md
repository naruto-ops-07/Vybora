# Database

All objects are created by `supabase/migrations/*.sql` (applied in order):

| Migration               | Contents                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_foundation`       | `private` schema, profiles, user_settings, user_roles, audit_logs, notifications, device_tokens, media deletion queue, rate-limit trigger, new-user trigger, username availability |
| `0002_relationships`    | follows (+ requests), blocks, mutes, `viewer_can_view_profile`, `can_view_profile`, profile/follow read models, search, suggestions                                                |
| `0003_content`          | posts, post_media, likes, comments, saved_posts, hashtags, post_hashtags, `post_cards` view, feeds, `create_post`                                                                  |
| `0004_stories`          | stories, story_views, tray/viewers RPCs, `purge_expired_stories` (service role)                                                                                                    |
| `0005_messaging`        | conversations, conversation_members, messages, `start_direct_conversation`, inbox, read state, unread counts                                                                       |
| `0006_moderation`       | reports, moderation_actions, staff RPCs, admin overview/search, counter repair                                                                                                     |
| `0007_storage_realtime` | buckets + Storage RLS, `can_read_media`, realtime publication                                                                                                                      |
| `0008_maintenance`      | `claim_media_deletions`, `find_orphan_media` (service role)                                                                                                                        |

## Tables

**Identity:** `profiles` (1:1 with `auth.users`, cascades), `user_settings`, `user_roles` (admin/moderator), `follows` (pending/accepted), `blocks`, `mutes`.
**Content:** `posts` (`kind` post|reel, `status` published|removed), `post_media` (paths + metadata only), `likes`, `comments` (one reply level), `saved_posts`, `hashtags`, `post_hashtags`.
**Stories:** `stories` (server-set `expires_at = now() + 24h`), `story_views`.
**Messaging:** `conversations` (`direct_key` unique pair), `conversation_members` (`last_read_at`), `messages` (`client_id` idempotency key).
**Notifications:** `notifications` (trigger-created only), `device_tokens`.
**Safety:** `reports`, `moderation_actions`, `audit_logs`.
**Internal (not exposed):** `private.media_deletion_queue`.

Conventions: UUID PKs, `timestamptz`, FKs with deliberate `on delete cascade` (owned content) or `set null` (audit/actor references), CHECK constraints mirroring `@vybora/validation`, unique constraints for every relationship that must not duplicate (likes, follows, saves, memberships, open reports per reporter/target, one unread message notification per conversation).

## Indexes (by query pattern)

- Feeds: `posts (created_at desc, id desc) where published`, `(author_id, created_at desc, id desc)`, reels partial index.
- Relationships: `follows (following_id, status, created_at desc)` and `(follower_id, …)`; `blocks (blocked_id)`.
- Messages: `(conversation_id, created_at desc, id desc)`; members by `user_id`.
- Notifications: `(recipient_id, created_at desc, id desc)`, partial unread index.
- Search: `text_pattern_ops` prefix indexes on username, lower(display_name), hashtag tag.
- Rate limits: `(user, created_at desc)` on every rate-limited table.

## Pagination

Keyset cursors on `(created_at, id)` everywhere (Trending uses `(score, created_at, id)`). Clients dedupe pages by id (`flattenUnique`) so rows shifting between pages never duplicate.

## Counters

Maintained by `security definer` triggers; clients have no UPDATE grant on counter columns. Repair: `select public.admin_recount_counters();` (admin only, audited).

## Generated types

`pnpm db:types` boots PGlite, applies the migrations and introspects them into `packages/types/src/database.ts` (same shape as `supabase gen types typescript`). With a linked project you can alternatively run:

```bash
supabase gen types typescript --local > packages/types/src/database.ts
```

## Migration workflow & rollback

1. New file per change, never edit applied migrations; grant explicitly whatever a new table, view, sequence or function needs (hosted projects have no default privileges, see `20261018000014_explicit_client_grants.sql`). 2. `pnpm test:db` (runs with and without default privileges and fails on any difference) + `pnpm db:types`. 3. Review SQL in PR. 4. `pnpm db:push` to staging, verify, then production.

Rollback: write a forward "down" migration (Supabase applies forward-only). Before risky changes take a backup (`supabase db dump -f backup.sql` or dashboard PITR on paid plans). Destructive changes (dropping columns/tables) must be split: stop writing → deploy → drop in a later migration.
