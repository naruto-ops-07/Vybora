# Security model

**Principle:** clients are untrusted. Every rule is enforced in Postgres (RLS, column grants, triggers, `security definer` functions) or in Edge Functions holding the service role. UI guards (`RequireAuth`, `RequireStaff`, hidden buttons) are convenience only.

## Identity

- Identity comes from the JWT (`auth.uid()`), never from a user id sent by the client. Insert policies require `owner = auth.uid()`; owner columns default to `auth.uid()`.
- Profiles are created by the `on_auth_user_created` trigger; reserved/invalid usernames fall back to a generated name.
- Roles live in `user_roles`, which has **no client insert/update/delete grant**. The first admin is granted via SQL by an operator. `admin_set_role` is admin-only, audited, and refuses to revoke your own admin role.

## Visibility rules (`private.viewer_can_view_profile`)

Content of an account is visible to a viewer if the viewer is the owner, **or** is staff, **or** the owner is active, neither has blocked the other, and the account is public or the viewer is an accepted follower. Posts, media, likes, comments, hashtags links, stories, story media and follower lists all build on it. Staff can view content for moderation but **never** read private messages (no staff clause in messaging policies).

## Policy matrix (summary)

| Table                                                        | SELECT                                                                                                                                                          | INSERT                                                                                                     | UPDATE                                           | DELETE                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| profiles                                                     | everyone except those the owner blocked; suspended hidden                                                                                                       | trigger only                                                                                               | owner, safe columns only                         | cascade from auth                                    |
| follows                                                      | parties, or both profiles visible                                                                                                                               | follower = me, active; status decided by trigger                                                           | followed user: pending→accepted only             | either party                                         |
| blocks / mutes                                               | own                                                                                                                                                             | own                                                                                                        | —                                                | own                                                  |
| posts / post_media                                           | `can_view_post`                                                                                                                                                 | author = me, active (media: object must exist in my folder, MIME must match)                               | author: caption, comments_enabled                | author                                               |
| likes / saved_posts                                          | likes: visible posts; saved: own only                                                                                                                           | user = me & can view post                                                                                  | —                                                | own                                                  |
| comments                                                     | visible post & not blocked                                                                                                                                      | author = me, can view, not blocked, comments enabled                                                       | —                                                | comment author or post owner                         |
| stories                                                      | not expired & visible                                                                                                                                           | author = me (expiry set by server)                                                                         | —                                                | author                                               |
| story_views                                                  | own rows or story author                                                                                                                                        | viewer = me, story visible, not own                                                                        | —                                                | —                                                    |
| conversations / members / messages                           | members only                                                                                                                                                    | members via `start_direct_conversation` only; messages: sender = me & member & not blocked                 | own `last_read_at`                               | messages: sender                                     |
| devices / key_packages                                       | devices: public key + revoked status to signed-in users who haven't blocked you; label/platform/last seen only to the owner (`my_devices()`); key packages: own | own, active, regex-checked identity key, max 10 devices / 100 packages                                     | own device: label, last seen, revoke (permanent) | key packages: own                                    |
| mls_envelopes / mls_welcomes                                 | members from their `joined_seq` on / the target device                                                                                                          | commits only via `post_commit`; application messages: own active device, member, current epoch, rate limit | —                                                | expiry purge (service role); welcomes: target device |
| conversation_preferences, contact_nicknames, contact_methods | owner only                                                                                                                                                      | owner                                                                                                      | owner                                            | owner                                                |
| notifications                                                | recipient                                                                                                                                                       | triggers only                                                                                              | recipient: `read_at`                             | recipient                                            |
| device_tokens                                                | own                                                                                                                                                             | own                                                                                                        | own                                              | own                                                  |
| reports                                                      | reporter or staff                                                                                                                                               | reporter = me                                                                                              | staff RPC only                                   | —                                                    |
| moderation_actions / audit_logs                              | staff / admin                                                                                                                                                   | definer RPCs only                                                                                          | —                                                | —                                                    |

## End-to-end encrypted messaging (VYBORA Connect)

New conversations are end-to-end encrypted with MLS (RFC 9420); the server stores ciphertext only and never receives message content or private keys. Full design, threat model, metadata the server can see, and limitations: **[CONNECT.md](CONNECT.md)**.

- Not independently audited (neither Connect nor the `ts-mls` library). Do not claim Signal-equivalent security until it is.
- Authorization never trusts client-supplied ids: every RPC derives the user from `auth.uid()` and checks that the device belongs to that user, is active, and is a member.
- Realtime is a signal only; typing and presence use **private** channels authorized by RLS on `realtime.messages` (disable public channel access in Realtime settings).
- Push payloads contain no message content; the server applies mute/notification settings via a service-role-only function.
- Encrypted attachments live in the private `connect` bucket (`application/octet-stream`, 26 MB), readable only by conversation members.

## Last seen and presence

Added by migration `20261015000012_last_seen.sql` (not yet pushed to the hosted project).

- **`user_activity`** holds one `last_active_at` per user. RLS is on and **all client grants are revoked**; only the functions below touch it, so activity never leaks through profiles or devices.
- **`touch_activity()`** is `security definer`, uses server time (`now()`, never a client timestamp) and writes at most once per 60 s per user. Clients call it only while the user's own "show when I'm online" setting is on.
- **`last_seen(uuid[])`** returns rows only when the caller shares a chat with the target, both sides have `show_online` on, and neither has blocked the other. Values are truncated to the minute. It rejects more than 100 ids (counted with `cardinality()`, so nested arrays cannot slip past) and multi-dimensional arrays. Helpers `caller_shows_online()` and `caller_blocked_with(uuid)` are `security definer` because RLS hides the other party's rows from the caller.
- **Presence is reciprocal.** The `connect: presence read` policy on `realtime.messages` now lets you read someone else's presence only while your own `show_online` is on and no block exists either way. Your own presence topic stays readable.
- **Presence changes apply on the next join, not instantly.** Supabase Realtime evaluates private-channel policies when a client joins a channel (and again when its access token is refreshed). A client that already joined someone's presence channel keeps receiving their presence after a block or a `show_online` change until it rejoins or its token refreshes. `last_seen()` is checked on every call, so last seen stops immediately.
- **Clients** hide last seen, including cached values, whenever the user's own setting is off.
- **Accessibility preferences** (text size, high contrast, reduce motion, haptics, swipe to reply, always-visible actions) are stored on the device only and are never sent to the server.

## Storage

- `avatars` (public by design), `media` (private), `dm` (private, legacy DMs), `connect` (private, encrypted attachments only). Size and MIME allow-lists are set on the buckets.
- Writes only into `{auth.uid()}/…` (`dm`: `{conversation}/{auth.uid()}/…` and must be a member).
- `media` reads go through `can_read_media(name)`: own uploads, visible published post media, or unexpired visible stories. Clients receive 1-hour signed URLs.
- File type is verified three ways: magic-byte sniffing on the client (`detectMime`), bucket MIME allow-lists, and triggers comparing the declared type with the stored object metadata.

## Abuse controls

Rate limits (BEFORE INSERT triggers, per user): posts 30/h, comments 20/min, likes 60/min, follows 200/h, messages 60/min, stories 100/day, reports 20/h. One open report per reporter+target. Suspended accounts cannot write anything (policies check `current_user_active()`).

## Secrets

- Service-role key: Edge Function secrets and local scripts only. Never in `VITE_*`/`EXPO_PUBLIC_*`, never committed (`.gitignore` covers `.env*` except examples and the placeholder-only `apps/web/.env.development`).
- `cleanup-media` requires `x-cron-secret`; `send-push` requires `x-webhook-secret` (constant-time compare).
- Push payloads never include message text — for encrypted chats the server never has it.

## Web hardening

`vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. User text is rendered as React text nodes (no `dangerouslySetInnerHTML`); links use `rel="noopener noreferrer nofollow ugc"`. Post-login redirects accept same-origin relative paths only (`safeNext`).

## Verified by tests

`supabase/tests` (96 tests, including 23 Connect RLS/RPC tests and 11 end-to-end encryption flow tests with real engines) runs the real migrations on Postgres 17 and checks, among others: the server never stores plaintext, third parties cannot read or inject into encrypted chats, revoked devices are cut off, anonymous/stranger access to private content and media, forging likes/follows for others, editing others' profiles/posts, counter forgery, self-granted admin, staff vs moderator vs user privileges, staff cannot read DMs, non-members cannot read or join conversations or fetch attachments, notification recipient isolation, story expiry for rows and media, block enforcement, MIME mismatch, rate limiting and service-role-only maintenance functions.

## Known gaps / future hardening

- No per-user storage quota beyond bucket limits + rate limits; abandoned uploads are deleted after 24h.
- Legacy DMs (created before Connect) were protected by access control only. They are read-only since migration 0011 (insert grant and `start_direct_conversation` revoked); all new conversations are end-to-end encrypted.
- There is no admin or staff console in the apps (removed 2026-10-14). Staff roles and moderation RPCs still exist in the database; none of them can read messages, envelopes or attachments.
- Message metadata (membership, timing, sizes, group titles, shared themes) is visible to the server operator — see [CONNECT.md](CONNECT.md#what-the-server-can-and-cannot-see).
- Suspension blocks all writes and hides the account, but does not revoke existing sessions in Supabase Auth (use the dashboard / Auth admin API "ban" for that).
- A formal third-party security audit has not been performed.
