# Friends (add by username) — design and build plan

_2026-10-16. Requested: "add friend requests by username and make this whole project super Blockbuster". The user opted out of questions, so every product decision below is the builder's call, marked **(call)**._

## Intent

Let people build a trusted circle inside VYBORA: send a friend request by typing someone's exact username, accept or decline incoming requests, see friends in one place, start a chat with a friend in one tap, and optionally only accept new chats from friends. Built to the same premium bar as the messenger layout work ("Blockbuster" = polished, delightful, no rough edges, within VYBORA's design rules).

## Goals

1. Add friend by exact username (case-insensitive, `@` optional) from web and mobile.
2. Incoming requests: Accept / Decline. Outgoing: Cancel. If the other person already sent you a request, adding them accepts it (instant friends).
3. Friends list with name, @username, avatar, online dot (subject to the reciprocal online rule), "Message" (opens/creates the direct chat) and "Remove friend".
4. Incoming-request count badge on the Friends entry (web rail + mobile bottom/header entry).
5. Privacy → "Who can start chats with me": Everyone (default) / Friends only.
6. Blocking someone removes any friendship and pending requests between you.

## Non-goals

- No contact sync, phone-number discovery, QR codes, suggestions, mutual-friend counts.
- No push notification for friend requests in this round **(call)** — in-app badge + periodic refresh only.
- No change to how groups are created (anyone you can message can still be added).

## Anti-goals (would be a failure even if it works)

- Revealing whether a username exists to someone who is blocked / leaking block status ("user not found" must be the same for unknown, inactive, and blocked).
- Letting a client forge friendships or requests on someone else's behalf (all writes via `security definer` RPCs using `auth.uid()`).
- Request spam: unbounded outgoing requests.
- Breaking the existing "following" legacy privacy value or existing chats.

## Data model (additive migration `20261016000013_friends.sql`)

- `public.friend_requests (requester_id uuid, addressee_id uuid, created_at timestamptz default now(), primary key (requester_id, addressee_id), check (requester_id <> addressee_id))`, FK to profiles on delete cascade; index on `(addressee_id, created_at desc)`.
- `public.friendships (user_low uuid, user_high uuid, created_at timestamptz default now(), primary key (user_low, user_high), check (user_low < user_high))`, FKs cascade; index on `user_high`.
- RLS enabled on both; `revoke all … from public, anon, authenticated` — clients only use the RPCs below.
- `user_settings.message_privacy` check constraint extended to `('everyone', 'following', 'friends')` (drop + re-add constraint; existing values stay valid). The client update grant already covers the column.

### RPCs (all `security definer`, `set search_path = ''`, execute granted to `authenticated` only; raise `not_authenticated` 42501 when `auth.uid()` is null)

| Function                                                                                                                                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_friend_request(p_username text) returns text`                                                                                             | Trim, strip one leading `@`, lower-case match on `profiles.username`. Not found / inactive / blocked either way → raise `user_not_found` (P0002). Self → `cannot_add_self`. Already friends → return `'already_friends'`. Reverse pending request exists → create friendship, delete that request, return `'accepted'`. Own pending exists → `'already_sent'`. More than 100 pending outgoing → raise `too_many_requests` **(call)**. Else insert, return `'sent'`. |
| `respond_friend_request(p_requester uuid, p_accept boolean) returns void`                                                                       | Request (p_requester → me) must exist else `request_not_found`. Accept → insert friendship (ordered pair), delete request. Decline → delete request (silent to the requester — it simply disappears from their outgoing list **(call)**).                                                                                                                                                                                                                           |
| `cancel_friend_request(p_addressee uuid) returns void`                                                                                          | Delete my pending request to them (no-op if none).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `remove_friend(p_friend uuid) returns void`                                                                                                     | Delete the friendship (no-op if none).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `my_friends() returns table (user_id uuid, username text, display_name text, avatar_path text, since timestamptz)`                              | Friends of the caller, excluding inactive profiles, ordered by display name / username.                                                                                                                                                                                                                                                                                                                                                                             |
| `my_friend_requests() returns table (direction text, user_id uuid, username text, display_name text, avatar_path text, created_at timestamptz)` | `'incoming'` and `'outgoing'` pending requests, newest first, excluding inactive profiles.                                                                                                                                                                                                                                                                                                                                                                          |
| `are_friends(p_user uuid) returns boolean`                                                                                                      | Caller ↔ p_user friendship exists (used by UI and by `can_message`).                                                                                                                                                                                                                                                                                                                                                                                                |

- Trigger `after insert on public.blocks`: delete friendship and both directions of pending requests between the pair.
- `private.can_message(p_user)`: add `or (message_privacy = 'friends' and <friendship exists between auth.uid() and p_user>)`; keep `everyone` and the legacy `following` branch unchanged. (Replace the function with `create or replace`; same signature.)

### DB tests (`supabase/tests/friends.test.ts`, PGlite harness)

Send by exact username (case/`@` insensitive); unknown vs blocked vs inactive all → same `user_not_found`; self → error; duplicate → `already_sent`; reverse pending → `accepted` and friendship exists; accept/decline/cancel/remove; non-addressee can't respond; no direct table access (select/insert denied); block removes friendship and requests; `friends` privacy: non-friend `create_secure_conversation` direct → `cannot_message`, friend → ok; `following` and `everyone` unchanged; too_many_requests at 101; anon denied.

## API (`packages/api/src/friends.ts`, exported from index)

`sendFriendRequest(client, username) → 'sent' | 'accepted' | 'already_friends' | 'already_sent'`, `respondFriendRequest(client, requesterId, accept)`, `cancelFriendRequest(client, addresseeId)`, `removeFriend(client, friendId)`, `fetchFriends(client) → Friend[]`, `fetchFriendRequests(client) → { incoming: FriendRequest[]; outgoing: FriendRequest[] }`. Query keys `qk.connect.friends`, `qk.connect.friendRequests`. `ConnectPrivacy.message_privacy` type gains `'friends'`. Unit tests with a fake client (mapping + error passthrough). Regenerate `packages/types/src/database.ts` with `pnpm db:types` and Prettier-format it.

## Web

- Route `/friends` inside the workspace; rail + mobile-web bottom nav get **Friends** (Phosphor `UsersThreeIcon` or `UserPlusIcon`), with a numeric incoming badge (4 px radius, accent, `99+`, sr-only "N friend requests"). The list pane shows `FriendsPane`; the content pane shows a calm empty state when nothing is selected ("Add people by their username. They'll see your request next time they open VYBORA.").
- `FriendsPane` sections:
  1. **Add a friend** — input with `@` prefix (same field styling as inbox search), "Send request" button; inline result message per status: sent → "Request sent to @name", accepted → "You and @name are now friends", already_friends, already_sent, user_not_found → "No one with that username" (never hint at blocks), cannot_add_self, too_many_requests. Enter submits; button shows loading; input clears on success.
  2. **Requests** (only when any) — incoming rows with Accept (primary) / Decline (ghost); outgoing rows "Pending" with Cancel. Optimistic removal with rollback + error toast on failure.
  3. **Friends (N)** — rows: avatar 48 px + online dot (reciprocal rule via existing privacy query + `watchPresence` through the shared registry), name, @username; "Message" button (finds existing direct conversation with that user in the inbox cache, else `createSecureConversation('direct', [id])`, then navigates); overflow menu (Radix context/dropdown consistent with chat rows) with "Remove friend" → confirm dialog.
  - Empty states: no friends yet; no requests.
- Polling: `fetchFriendRequests` refetch every 30 s + on window focus; friends list invalidated after any action.
- Privacy page: "Who can start chats with me" row is always shown with a segmented/select control Everyone / Friends only (keeps showing the legacy "following" explanation + reset button only if that value is set).
- New-message dialog: show **Friends** first as a quick-pick list above search results when the search box is empty **(call)**.
- Command palette: "Add a friend" action → `/friends` and focuses the input.
- Tests: FriendsPane (send flows incl. each status message, accept/decline/cancel optimistic + rollback, remove with confirm, empty states), privacy select, badge count.

## Mobile

- New screen `app/messages/friends.tsx` (Stack title "Friends"), reachable from the inbox header (new `user-plus`/`users` IconButton with badge) and from Settings.
- Same three sections with native controls: add-by-username `TextInput` (autoCapitalize none, autoCorrect off, `@` prefix), Accept/Decline/Cancel buttons (44 px), friends rows with Message + long-press / accessibility action "Remove friend" (Alert confirm). Haptics on success via `useHaptics`. Screen-reader labels on everything; `accessibilityActions` on friend rows (Message, Remove friend).
- Privacy screen: Everyone / Friends only segmented control.
- New chat screen: friends quick-pick when search empty.
- Tests: ChatRowParts-style presentational components (`FriendRow`, `RequestRow`, `AddFriendForm` status messages) in `src/__tests__/friends.test.tsx`.

## Design rules (unchanged)

No gradients, no shadows, no pills, radii 4/8/12, Archivo + IBM Plex Mono, Phosphor icons, sentence-case copy, ≥ 44 px touch targets, light/dark/high-contrast, reduced motion respected, per-device text size via `.text-msg`/`scale`.

## "Blockbuster" polish (final task)

After friends ships: a focused polish pass over the user-facing surfaces touched recently — friends, chat list, chat view, settings — checking empty/loading/error states, copy, spacing rhythm, focus order, and a landing-page feature line for friends. No new visual language; fix inconsistencies only. Landing gets "Add friends by username" in the features strip.

## Build plan (subagent-driven, each task reviewed)

1. DB migration + DB tests + types + API module + API tests.
2. Web friends (route, pane, rail badge, privacy select, new-chat quick-pick, palette action) + tests.
3. Mobile friends (screen, header entry, privacy, new-chat quick-pick) + tests.
4. Polish pass + landing line + docs (FEATURE_STATUS, SECURITY, CONNECT, CHANGELOG) + `pnpm check` + Playwright.

Migration is not pushed to the hosted project until the user says so.
