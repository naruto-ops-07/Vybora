# VYBORA Connect — end-to-end encrypted messaging

_Introduced 2026-10-09 · migrations `20261010000009_connect.sql`, `20261010000010_connect_device_privacy.sql` · package `@vybora/e2ee`_

VYBORA Connect replaces plaintext DMs with end-to-end encrypted direct and group chats on web, iOS and Android. Message content, attachments, reactions, replies and deletions are encrypted on the sender's device and can only be decrypted on the devices of the people in the conversation. The server stores and relays ciphertext.

> **Honest status.** Connect uses a standard protocol (MLS, RFC 9420) through an open-source library, and every protocol path is covered by automated tests (below). It has **not** had an independent security review, and the MLS library it uses (`ts-mls`) has not been formally audited either. Do not describe it as "Signal-grade" or equivalent until such a review has happened.

## Contents

1. [Protocol](#protocol)
2. [Architecture](#architecture)
3. [What the server can and cannot see](#what-the-server-can-and-cannot-see)
4. [Devices, keys and verification](#devices-keys-and-verification)
5. [Personalization & privacy controls](#personalization--privacy-controls)
6. [Notifications](#notifications)
7. [Limitations](#limitations)
8. [Operations: deploy, configure, roll back](#operations)
9. [Testing](#testing)

## Protocol

| Item            | Choice                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Group protocol  | **MLS 1.0 (RFC 9420)** via [`ts-mls`](https://github.com/LukaJCB/ts-mls) 1.6.4 (pinned)                                 |
| Ciphersuite     | `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519` (suite 3)                                                         |
| Primitives      | `@noble/curves`, `@noble/hashes`, `@noble/ciphers` (independently audited), `@hpke/*` (HPKE)                            |
| Membership unit | **Device**, not user: each phone/browser is its own MLS leaf with its own identity key                                  |
| Forward secrecy | Per-epoch key schedule + secret-tree ratchet; commits advance the epoch on membership changes                           |
| Post-compromise | Any member's commit (e.g. adding/removing a device) refreshes group secrets                                             |
| Inner signature | Ed25519 over `vybora-msg-v1 \| conversation \| device \| id \| sha256(payload)` binds each payload to its sender device |
| Attachments     | XChaCha20-Poly1305 with a fresh random 32-byte key per file; key + nonce + SHA-256 travel inside the MLS message        |
| Payload schema  | Strict zod schema (`text`, `attachment`, `reaction`, `delete`); anything else is rejected                               |

No custom cryptography is implemented. The only crypto-adjacent code we wrote is a **WebCrypto adapter** (`packages/e2ee/src/subtle.ts`): Hermes (React Native) has no `crypto.subtle`, so the adapter maps the subset of WebCrypto that the MLS library calls (Ed25519, X25519, HKDF, HMAC, SHA-2) onto the audited noble implementations. It is differentially tested against Node's native WebCrypto byte-for-byte, rejects all-zero X25519 outputs, and is only installed when native support is missing (Hermes, or browsers without Ed25519/X25519 such as Safari < 17).

### Message flow

```
sender device                         Supabase (ciphertext only)                 recipient devices
─────────────                         ──────────────────────────                 ─────────────────
payload → sign (Ed25519)
        → MLS encrypt (epoch n) ───▶  post_application(): member? device active?
persist ratchet + outbox first        epoch == current? rate limit → INSERT
                                      envelope (seq, ciphertext) ──realtime "ping"──▶ fetch envelopes > last seq
                                                                                   MLS decrypt → verify signature
                                                                                   → store locally (encrypted)
```

- **Postgres is the source of truth.** Realtime only signals "something changed"; clients always fetch from the table, so a missed event just means the next sync catches up.
- **Exactly-once sending.** Ratchet state and the ciphertext are persisted before posting. A retry re-sends the identical ciphertext under the same `client_id` (unique per device), so a lost response cannot create duplicates or desynchronize ratchets.
- **Membership changes** go through `post_commit()`, which takes a per-conversation row lock and compares epochs; concurrent commits lose cleanly (`epoch_conflict`), resync and retry. Devices are claimed through `claim_key_packages()` (`FOR UPDATE SKIP LOCKED`, one-time key packages).
- **Self-healing membership.** Every client reconciles on sync: new devices of members are added, revoked devices and departed users are removed.
- **History for new members.** `joined_seq` hides envelopes from before a member joined; new devices only read messages sent after they were added (MLS cannot decrypt older epochs anyway).

## Architecture

| Layer           | Location                                             | Responsibility                                                                                  |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Protocol engine | `packages/e2ee` (`ConnectEngine`)                    | Identity, key packages, MLS groups, send/sync/retry, attachments, safety numbers, local history |
| Transport       | `packages/api/src/connect.ts`                        | `ConnectTransport` over Supabase (RPCs, tables, private storage), realtime helpers, preferences |
| Database        | `supabase/migrations/…0009_connect.sql`              | Tables, RLS, RPCs, triggers, private `connect` bucket, realtime authorization                   |
| Mobile UI       | `apps/mobile/src/features/connect`, `app/messages/*` | Inbox, chat, details, verify, privacy; SQLite + Keychain/Keystore storage                       |
| Web UI          | `apps/web/src/features/connect`                      | 3-pane layout, IndexedDB storage, single-tab lock, lazy-loaded crypto chunk                     |

### Local storage (encrypted at rest)

All engine state — identity keys, MLS group state, key-package private keys, the outbox and decrypted history — goes through `EncryptedStore`, which seals every value with XChaCha20-Poly1305 using a 32-byte storage key and binds each ciphertext to its slot name (AAD), so values cannot be swapped between keys.

| Platform | Data                              | Storage key                                                                                      |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| iOS      | SQLite `connect-<user>.db`        | Keychain via SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (not backed up or migrated)           |
| Android  | SQLite `connect-<user>.db`        | Android Keystore-backed SecureStore                                                              |
| Web      | IndexedDB `vybora-connect-<user>` | Random key wrapped by a **non-extractable** AES-GCM `CryptoKey`; JS can use it but never read it |

Decrypted media is held in memory (web: object URLs) or a cache directory that is cleared on sign-out (mobile). On web, only one tab runs the engine at a time (Web Locks); other tabs show "open in another tab" with a "Use here" button.

## What the server can and cannot see

| The server **cannot** see                                  | The server **can** see (metadata)                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Message text, captions, replies, reactions, deletions      | Who is in which conversation, and each member's devices (other users see only a device's public key and revoked status; labels and last-seen times are owner-only) |
| Attachment contents, names, types, dimensions              | When envelopes are sent, their sizes, sender user + device, MLS epoch                                                                                              |
| Message previews (inbox previews are computed on-device)   | Delivered / read positions (sequence numbers) for receipts                                                                                                         |
| Private keys (identity, HPKE, group secrets, storage keys) | Group titles, shared chat themes/wallpapers, disappearing-message timers, group roles                                                                              |
|                                                            | Your private nicknames, mute/tone/pin/archive preferences (visible only to you via RLS)                                                                            |
|                                                            | Encrypted attachment blobs (size, upload time) in the private `connect` bucket                                                                                     |

Staff and admins have **no** policy that lets them read conversations, envelopes, welcomes or attachments. Reports of a user never include message content.

## Devices, keys and verification

- Each device registers an Ed25519 identity key (`devices`, max 10 active per user) and publishes one-time key packages (kept topped up to 20, claimed atomically).
- **Revocation is permanent.** Removing a device (Privacy & security → Linked devices) revokes it server-side, deletes its unclaimed key packages and pending welcomes, and other members' clients remove it from every group on their next sync. The revoked device wipes its local keys and history the next time it opens.
- **Sign out and erase this device** revokes the device and erases local storage. A plain "Log out" keeps the encrypted local store so signing back in on the same device restores history.
- **Safety numbers.** A 60-digit number derived from both users' identity keys. Compare it in person or on a trusted call; mark verified to pin it. Keys are trust-on-first-use pinned; if a contact's set of device keys changes, the chat shows a warning until you review it.
- **Undecryptable messages** (tampering, a device that joined later, a corrupted session) show a placeholder; they never crash the chat or show partial content.

## Personalization & privacy controls

| Feature                                  | Scope / storage                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Private nicknames                        | `contact_nicknames` — owner-only; never changes the other person's profile                                                             |
| Per-chat message tone                    | Default, Soft chime, Pop, Bell, Electronic, Silent — original tones generated by `scripts/generate-tones.mjs`                          |
| Notifications on/off (global + per chat) | Never blocks delivery; only affects alerts                                                                                             |
| Mute 1 h / 8 h / 1 week / always         | `conversation_preferences.muted_until` (`infinity` = always)                                                                           |
| Pin / archive / delete chat              | Per user; deleting clears local history and hides the chat until a new message                                                         |
| Shared chat theme + wallpaper            | `set_conversation_theme()` with compare-and-set on `theme_version`; visible to every member; admins-only when the group policy says so |
| Personal theme override                  | Only on your devices (`use_local_theme`)                                                                                               |
| Disappearing messages                    | 5 min – 1 week; enforced on every device (local purge) and on the server (`purge_expired_envelopes`, run by `cleanup-media`)           |
| Read receipts / typing / online status   | Each is opt-out; typing and presence use **private** realtime channels limited to conversation members                                 |
| Phone number                             | Optional, E.164 only, visibility Nobody (default) / Chats & mutual follows / Everyone; read only through `get_contact_phone()`         |
| Who can message me                       | Everyone, or people you follow                                                                                                         |
| Block / report                           | Blocking prevents new conversations and messages; reports contain no message content                                                   |
| App lock (mobile)                        | Face ID / fingerprint / passcode via `expo-local-authentication`                                                                       |

Address books are never uploaded and there is no contact discovery by phone number.

## Notifications

- The database creates a body-less `message` notification per recipient; while it is unread, further messages in the same chat update it instead of creating new ones, so a busy chat produces one push until it is read.
- `send-push` calls `should_push_message()` (service role only) to apply the recipient's global and per-chat settings and mute, then sends **"New message from {name}"**, or just **"New message"** if the recipient turned off "Show sender in notifications". Message content is never available to the server, so it can never be in a push.
- Per-chat tones map to bundled sounds on iOS and to per-tone Android channels (`messages`, `messages-<tone>`, `messages-silent`). Custom sounds require a development or store build; Expo Go cannot receive remote push at all and the client keeps its Expo Go guard.
- In the foreground, the app plays the chat's tone itself (and stays silent for the chat you are looking at).

## Limitations

- **No independent security review** of VYBORA Connect or of `ts-mls`. Recommended before marketing it as secure messaging.
- **Voice and video calls are not implemented.** They need a media server (e.g. LiveKit/SFU with TURN), credentials and a separate key-exchange design; none were available. The UI does not show call buttons.
- **Custom (user-uploaded) message tones** are not supported; the five bundled tones and Silent are.
- **Contact sync / discovery by phone number** is intentionally not implemented.
- **Web voice notes:** web can play voice messages recorded on mobile but does not record them (browser recorders produce WebM, which iOS cannot play).
- **History on new devices:** a newly added device sees messages sent after it was added, not earlier history (no encrypted backup/transfer yet).
- **Web key protection** is weaker than Keychain/Keystore: the non-extractable key stops the raw key from being copied out, but code running inside the page (e.g. an XSS bug) could still use it while the page is open.
- **Metadata** listed above is visible to the server operator.
- **Legacy DMs** created before Connect were never end-to-end encrypted (access control only). Since migration `20261014000011_legacy_dm_read_only.sql` they are **read-only**: members can read them and senders can unsend, but no new plaintext conversations or messages can be created — enforced by revoking the insert grant and `start_direct_conversation`, not just in the UI. Each legacy chat offers "Continue in encrypted chat".
- **Group size:** the server allows up to 255 members per group (the new-chat picker adds up to 50 at a time). Every device is its own MLS leaf (max 10 per user), so very large groups make membership commits heavier; this has not been load-tested.

## Operations

### Deploy

1. **Database** (additive; no data is modified or dropped):

   ```bash
   npx supabase@latest db push
   ```

   Applies `20261010000009_connect.sql` and `20261010000010_connect_device_privacy.sql` (column-level privacy for device metadata + `my_devices()`): new tables (`devices`, `key_packages`, `mls_envelopes`, `mls_welcomes`, `conversation_preferences`, `contact_nicknames`, `contact_methods`, device audit), new columns on `conversations`, `conversation_members` and `user_settings`, RPCs, the private `connect` bucket, realtime publication entries and realtime authorization policies.

2. **Realtime authorization:** Connect uses private channels (`connect:conv:<id>`, `connect:presence:<user>`) guarded by RLS on `realtime.messages`. In the Supabase dashboard, under **Realtime → Settings**, turn off **"Allow public access"** so only authorized private channels can be joined.

3. **Edge functions:** redeploy `send-push` and `cleanup-media`:

   ```bash
   npx supabase@latest functions deploy send-push cleanup-media
   ```

4. **Clients:** deploy the web build; ship a new mobile build (custom notification sounds and the new Android channels need a development/store build).

### Environment variables

No new variables. Existing ones are unchanged: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; function secrets `WEBHOOK_SECRET`, `CRON_SECRET`, optional `EXPO_ACCESS_TOKEN`. The service-role key is never used by clients.

### Roll back

- **Clients:** redeploy the previous web build / mobile release. To let older clients send legacy DMs again, run the grants listed at the top of `20261014000011_legacy_dm_read_only.sql`.
- **Functions:** redeploy the previous `send-push` / `cleanup-media` (they only _read_ the new RPCs).
- **Database:** both migrations are additive and can stay in place safely. To undo only `…0010`, run `grant select on public.devices to authenticated; drop function public.my_devices();` — but clients from this release call `my_devices()`, so roll clients back first. To remove Connect entirely, write a new down migration that restores the previous `my_conversations()` / `unread_counts()` definitions from the earlier migration and the `conversations.kind` check, then drops the Connect RPCs, tables and bucket. **Dropping `mls_envelopes`, `mls_welcomes` or the `connect` bucket permanently destroys all encrypted conversations** — there is no server-side copy that can be decrypted. Never reset the production database.

## Testing

| Suite                                   | What it proves                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/e2ee` — `subtle.test.ts` (13) | Adapter matches native WebCrypto byte-for-byte (HMAC, HKDF, SHA-2, Ed25519, X25519, key import/export); backend selection falls back when Curve25519 is missing                                                                                                                                           |
| `packages/e2ee` — `mls.test.ts` (10)    | Group lifecycle on emulated Hermes, native↔adapter interop, tamper rejection, key substitution, sender spoofing, replay, persistence, at-rest encryption, attachments, safety numbers                                                                                                                     |
| `supabase/tests/connect.test.ts` (23)   | RLS and RPCs: device limits/revocation, owner-only device metadata, atomic key-package claims, epoch checks, membership, joined_seq history cut-off, themes CAS, preferences, phone visibility, realtime authorization, push gating, purge                                                                |
| `supabase/tests/e2ee-flow.test.ts` (11) | Real engines over a real Postgres: server never stores plaintext, third parties denied, concurrent creation, lost-response retry without duplicates, tampering, reactions/deletes, encrypted attachments, new device auto-add, revoked device removal + self-wipe, group removal, local history encrypted |
| `packages/api` — `connect.test.ts` (4)  | Mute presets, "always" mute, peer resolution                                                                                                                                                                                                                                                              |
| `apps/web` — `connect.test.tsx` (8)     | Safe rendering (no HTML injection, hardened links), reactions/reply/delete permissions, undecryptable placeholder, composer keyboard + paste, single-tab lock                                                                                                                                             |
| `apps/mobile` — `connect.test.tsx` (5)  | Bubble states, retry, safety-number screen and change warning                                                                                                                                                                                                                                             |

Run everything with `pnpm check`, or `pnpm test:db` for the database suites only.
