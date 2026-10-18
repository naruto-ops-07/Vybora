# Premium look, app lock, email codes and WhatsApp-style features — design

_2026-10-18. Agreed with the owner in conversation. Anything marked **(call)** is the designer's decision, made where the owner left it open; everything else the owner said or confirmed._

## Why

The owner finds the current look boring: flat graphite, one accent, no depth. VYBORA is for young social users who should find it "private and beautiful" (PRODUCT.md), and right now it is only private. At the same time the owner wants VYBORA to do almost everything WhatsApp does, plus a few things it doesn't. They also want two account protections: an app lock on the website as well as the phone, and email verification by code (with optional sign-in by code).

Success: a person coming from WhatsApp finds every everyday thing they rely on, opens an app that feels rich and premium in the look they chose, and nothing about privacy gets weaker.

## Scope of this round

1. **Email codes:** verify a new account with a 6-digit email code; optionally sign in with an emailed code.
2. **App lock:** on web (new) and mobile (existing, upgraded), plus per-chat lock.
3. **New look with a theme picker:** Velvet (default), Aurora and Bloom, each in light and dark, on every surface of web and mobile.
4. **Messaging features wave A:** WhatsApp parity.
5. **Messaging features wave B:** the remaining parity items and the extras.
6. **Phone verification and contact sync:** built and tested now, switched off until the owner connects an SMS service.

Build in this order; each part gets its own plan and review.

### Next round (owner: "next round")

Voice and video calls, Status / Stories, communities and channels, chat backup and export **(call: the owner deferred calls and Status; the other two were grouped with them)**.

### Non-goals

- No change to the encryption protocol (MLS) or to what the server can see beyond what is listed here.
- No adding friends by typing a phone number: manual adding is by username only (owner). Phone numbers are used only for opt-in contact sync between verified numbers (part 6).
- No admin, moderation or plaintext-access tools.

### Anti-goals (a failure even if it works)

- Any new feature puts message content, link URLs, locations, poll questions or search terms on the server or in push payloads.
- Any new feature tells a stranger whether an email address has an account.
- Contact sync matches anyone who didn't verify their own number and allow being found, or keeps the uploaded contacts.
- The new look loses readability: contrast below WCAG AA, no high contrast, or no reduced motion.
- The look is applied to some screens and not others.

## Binding rules: what changed

The owner **dropped the old visual rules** on 2026-10-18 ("yes" to using depth, soft shadows, gradients and richer colour). These still hold:

- WCAG 2.2 AA (high contrast 7:1); ≥ 44 px touch targets.
- Reduced motion, per-device text size, and Phosphor icons.
- No emoji as interface icons; sentence case.
- No invented claims or testimonials; no message text outside chats.
- No claim of an independent audit or "Signal-equivalent" security.

PRODUCT.md "Brand Commitments" and docs/DESIGN_SYSTEM.md must be updated to say this.

---

## 1. Email codes

### Sign up

1. The person fills in the sign-up form as today.
2. `signUp` triggers Supabase's confirmation email. The email template includes `{{ .Token }}`, a 6-digit code.
3. The app shows a "Check your email" screen with a six-box code field. It supports paste and autofill (`autocomplete="one-time-code"`; iOS `textContentType="oneTimeCode"`). It also has a "Resend code" button with a 60 s cooldown **(call)** and "Use a different email".
4. Verify with `supabase.auth.verifyOtp({ email, token, type: 'signup' })`. On success the person is signed in and goes to `next` (web) or the inbox.
5. **Fallback:** if the person clicks the link in the email instead, `/auth/callback` keeps working as today.
6. **Already registered:** `signUp` returns `already_registered`. The screen says "That email already has an account" and offers **Sign in with a code** and **Sign in with password**.

### Sign in by code (optional)

- The sign-in screen gets "Email me a code instead". It calls `signInWithOtp({ email, options: { shouldCreateUser: false } })`, then shows the same code screen with `verifyOtp({ type: 'email' })`.
- **Anti-enumeration (call):**
  - Always show "If there's an account for that email, we've sent a code" and the code field, even when Supabase reports that no user exists.
  - Map errors to neutral copy.
  - Wrong or expired codes say "That code didn't work. Check it or send a new one."
- Password sign-in stays the default.
- Both flows (code at sign-up, sign-in by code) ship on web **and** mobile.
- Password reset keeps today's emailed link **(call)**.

### Shared code

- API: `verifyEmailCode`, `sendSignInCode` and `resendSignUpCode` in `packages/api/src/auth.ts`.
- Validation: a 6-digit schema in `packages/validation`.
- Web and mobile code-entry components.

### Configuration (the owner must act; never done silently)

- **Hosted Supabase:**
  - Auth → Email Templates: "Confirm signup" and "Magic Link" must include `{{ .Token }}`.
  - Email OTP length 6, expiry 10 minutes **(call; recommended value)**.
  - "Confirm email" must be on.
  - I write the exact template text into `docs/DEPLOYMENT.md`. The owner applies it, or asks me to and grants access.
- **Local (`supabase/config.toml`):** keep `enable_confirmations = false` for the end-to-end tests. Add the template files under `supabase/templates/` so local and hosted match.

### Tests

Unit tests for the API wrappers (error mapping, the neutral message). Component tests for the code field: paste, autofill, resend cooldown, error states. Mobile tests for the same.

---

## 2. App lock

### Web (new)

- **Turning it on:** Settings → Privacy → App lock. The person sets a 6-digit passcode **(owner: "my guess" accepted)** and confirms it. Optionally they add "Unlock with fingerprint, face or Windows Hello" through WebAuthn with a platform authenticator (`userVerification: 'required'`); it is offered only when available.
- **What is stored:**
  - Passcode: PBKDF2-SHA-256 with a random salt and 600 000 iterations **(call)**, in `localStorage` under `vybora.applock.<userId>`.
  - WebAuthn: the credential id and public key, verified locally.
  - Nothing goes to the server.
- **When it locks:**
  - When the app opens.
  - After a chosen time away: immediately, 1 minute (default **(call)**), 5 minutes or 1 hour. "Away" means the tab was hidden or the device was idle, measured with `visibilitychange` plus the last-activity time.
- **The lock screen:**
  - It covers the whole workspace and hides the chat list, previews and notifications. The page title and favicon badge drop the unread count while locked **(call)**.
  - It has a passcode field and a biometric button.
  - After 5 wrong tries there is a 30 s wait, doubling each time. After 10 wrong tries, "Sign out of this device" is offered **(call)**.
- **Forgotten passcode:** sign out on this device and sign back in. Signing out clears the lock.
- **Honesty (copy in Settings):** "App lock hides your chats on this device. It doesn't encrypt them." Message keys stay as they are today.

### Mobile (upgrade of the existing lock)

- Keep the `expo-local-authentication` biometrics or device passcode.
- Add the same timing choices: immediately, 1 / 5 / 60 minutes. This replaces the fixed 60 s grace.
- Add a privacy cover in the app switcher: a blurred lock screen when the app goes to the background.
- Give it the new look.

### Chat lock (both platforms; built in wave B)

- A chat can be locked from its menu. Locked chats move to a "Locked chats" row at the top of the list. Opening it needs the app-lock passcode or biometrics.
- A locked chat's preview is hidden in the app on that device. Push notifications come from the server, which can't know about a device-only lock, so **locking a chat turns its notifications off** (the existing per-chat `notifications_enabled`, already metadata the server holds) and unlocking offers to turn them back on **(call)**.
- The locked list is per device **(call)**, stored with the app-lock settings.

---

## 3. New look and theme picker

### Themes

Three looks, each light and dark, chosen in **Settings → Appearance**: "Velvet", "Aurora" or "Bloom", plus "Light / Dark / Match system". The choice is per device (web `localStorage`, mobile SecureStore under `vybora.appearance`), like the accessibility settings. The default is **Velvet, match system**. Today's light/dark choice in Settings → Account moves to the new Appearance page **(call)**. Signed-out pages (landing and auth) use the look saved on that device, else Velvet **(call)**.

| Look                 | Dark                                                                                                                                  | Light **(call: light versions)**                                                                              | Type                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Velvet** (default) | Warm black `#0F0D0B`, raised `#1C1916`, deep emerald outgoing bubble (gradient `#145244 → #0D3B31`), champagne gold accents `#D4B483` | Ivory `#FBF8F2`, warm white raised surfaces, emerald `#0F5C4C` bubble with ivory text, gold `#9A7A45` accents | Fraunces (display: titles, names, big numbers) + DM Sans (text) |
| **Aurora**           | Night `#060A13` with soft teal and violet light behind frosted panels; teal → indigo gradient bubble                                  | Pale sky `#F4F7FB` with faint aurora tints; same gradient bubble                                              | Sora + Manrope                                                  |
| **Bloom**            | Plum night `#17121F` with pink and violet glows                                                                                       | Pearl `#F7F5FC`; sunset pink → orange bubble, violet accents                                                  | Plus Jakarta Sans                                               |

The mockups the owner saw: `.superpowers/brainstorm/929-1792304247/content/look-directions.html`.

### Token architecture

Extend `packages/config` themes to `themes[look][mode]`, keeping the semantic token names. New tokens:

- elevation (`shadow-1/2/3`, soft offset shadows, with dark-mode variants);
- `bubble-out` as a fill or gradient;
- `primary` fill or gradient for the main button;
- `glow` (Aurora/Bloom backgrounds);
- `display-font` and `text-font`;
- radius scale per look (Velvet 6/12/18, Aurora 8/14/20, Bloom 10/16/24) **(call)**.

High contrast keeps its own token set, flattens gradients and shadows, and meets 7:1 in every look. Web: CSS variables switched by `data-look` and `data-theme` on `<html>`. Mobile: `useTheme()` returns the resolved set.

### Fonts

- **Web:** self-hosted woff2 files (`@fontsource` packages, exact versions), loaded per look. The default look's fonts load first. Archivo and Plex Mono stay only where data needs mono (timestamps, codes).
- **Mobile:** `@expo-google-fonts/fraunces`, `dm-sans`, `sora`, `manrope` and `plus-jakarta-sans`. All are new dependencies at exact versions, installed with the lockfile.

### Existing features under the new look

- **Personal tones:** each look gets its own 8-tone palette with contrast tests (`personTones[look][mode]`). Velvet uses jewel tones; Bloom uses vivid ones; Aurora keeps today's.
- **Chat themes** (per-conversation colours) stay. "Default" means "the app look's own bubble". The named colours keep their colour, with the look's depth.
- **Illustrations:** they take their colours from the look's tokens.
- **Sealed send and friendship joined:** unchanged in behaviour, restyled.
- **Motion:** each look may add one ambient effect: Aurora's slow light drift, Bloom's soft glow. Each is off under reduced motion. No hover lift or scale on controls **(call: kept, because it stops jank in lists)**.

### Empty chat list: a fresh account (owner request)

When the Chats tab has no chats, the empty state depends on whether the person has friends yet. Web InboxPane and the mobile inbox use the same rule, shared in `packages/core`:

| State                                            | Heading            | Sentence                                                       | Actions                                                                                                                                          |
| ------------------------------------------------ | ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No friends, no outgoing requests (fresh account) | **No friends yet** | "Find your friends by their username and start chatting."      | Primary **Find friends** (opens Friends with the username field focused); secondary **Share your username** (opens the share sheet / HandleCard) |
| No friends, but requests sent                    | **No friends yet** | "Waiting on {n} request(s). Find more friends while you wait." | **Find friends**                                                                                                                                 |
| Friends, no chats                                | **No chats yet**   | "Say hi to a friend."                                          | Up to 5 friends as one-tap avatars (opens or creates the direct chat), then **New message**                                                      |

The friends query decides which state shows. While it loads, the state stays neutral (no flash of "No friends yet"). If it fails, the "Friends, no chats" copy is shown without the avatars **(call)**. The Get started panel stays above it.

### Friends screen: requests (owner request)

Requests become two tabs, **Received** and **Sent**, each with a count (Received count also on the badge). Received rows keep Accept and Decline; Sent rows keep "Pending" and Cancel. Same on web and mobile.

### Coverage (every surface)

- **Web:** landing, sign in / up / reset / code, the 404 page, workspace (rail, chat list, chat, details, friends, new message, command palette), settings (all pages including Appearance and App lock), and the dev gallery.
- **Mobile:** auth, inbox, chat, details, friends, new chat, settings, privacy, accessibility and the lock screen.
- **Landing:** keeps the agreed copy, re-composed in Velvet. The hero gets depth and the product preview gets real shadows.

### Verification

- Gallery screenshots per look × mode × high contrast (desktop and mobile web).
- The core contrast tests extended to every look.
- The impeccable finish review, then DESIGN.md replaced to describe the new system.

---

## 4. Messaging features, wave A (WhatsApp parity)

### How new features travel

- Every feature that carries content is a **new encrypted payload kind**. `packages/e2ee/src/payload.ts` gains new `t` variants. The engine stores and lays them out.
- **Old clients:** the current discriminated union rejects unknown kinds. Add an `unknown` fallback first so that a client one version behind shows "Update VYBORA to see this message" instead of failing to decrypt **(call: ship the fallback in the first commit of the wave)**.
- Server-side additions are **metadata only**, and each is listed below.

### Features

| Feature             | How                                                                                                                                                                                                     | What the server learns (new) |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Edit a message      | `{t:'edit', target, body}`. Sender only, within 15 min **(call)**; shows "edited"; history not shown                                                                                                    | nothing                      |
| Forward             | Re-sends the content into another chat. Attachments are re-encrypted and re-uploaded to the target chat (bucket access is per conversation). Shows "Forwarded"                                          | nothing                      |
| Star messages       | Per device: a local list plus a "Starred" view **(call: not synced)**                                                                                                                                   | nothing                      |
| Pin a message       | `{t:'pin', target, pinned}`. Up to 3 pins per chat, shown in a bar at the top. Anyone may pin in a direct chat; in groups, follows the admins-only setting                                              | nothing                      |
| @mentions           | Mention ids inside the text payload; highlighted in the person's tone; "You were mentioned" jump. Push notifications can't know about mentions, because the server can't read them                      | nothing                      |
| Reply privately     | From a group message: opens or creates the direct chat with a reply quote                                                                                                                               | nothing                      |
| Message info        | Sheet with delivered and read per member (from existing receipts)                                                                                                                                       | nothing                      |
| Search              | In a chat and across chats, over the local decrypted store (SQLite / IndexedDB)                                                                                                                         | nothing                      |
| Contact card        | `{t:'contact', userId, username, displayName}`; "Message" / "Add friend" buttons                                                                                                                        | nothing                      |
| Location (one-time) | `{t:'location', lat, lng, label?}`; shown as coordinates and a drawn card, with "Open in Maps" (opens the OS maps app) **(call: no map tiles are loaded, because tile servers would see the location)** | nothing                      |
| View once           | Attachment flag `viewOnce`. The recipient's device deletes the key and blob after one view. Copy is honest: screenshots can't be blocked                                                                | nothing                      |
| Polls               | `{t:'poll', question, options ≤ 12, multi}` + `{t:'vote', target, choices}`; live tallies; who voted shown in groups                                                                                    | nothing                      |

## 5. Messaging features, wave B (remaining parity + extras)

| Feature                        | How                                                                                                                                                                                                                                                                           | Server learns                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Group invite links and QR      | Admin creates a revocable token (new table, RLS, admin-only RPCs). Someone with the link asks to join. An online admin device adds them to the MLS group (the existing add flow), and the person sees "Waiting for an admin's device" until then                              | that an invite token exists and who used it |
| Link previews                  | Built by the **sender's device**. Mobile fetches the page directly. Web can't (browsers block reading other sites), so **web sends links without previews but shows previews it receives** **(call)**. Preview title, description and image go inside the encrypted payload   | nothing                                     |
| Chat lock                      | See section 2                                                                                                                                                                                                                                                                 | nothing                                     |
| Chat folders                   | User-defined folders (name plus chats), synced in a new user-owned table so they show on every device **(call: synced, since it's only chat ids)**                                                                                                                            | folder names and which chats are in each    |
| Notes to self                  | A conversation with only my devices (MLS group of one member)                                                                                                                                                                                                                 | that the conversation exists                |
| Quiet hours                    | Start and end time plus days, stored in user settings. `send-push` skips push during quiet hours (still no content)                                                                                                                                                           | quiet-hours times                           |
| Disappearing timer per message | Payload `expiresInSec` (5 min to 1 week). The same local purge as chat-level disappearing                                                                                                                                                                                     | nothing                                     |
| Send later                     | Held **on the sending device** and sent when the time comes. It goes out only if that device (the app open on web, background fetch on the phone) is online at the time; the copy says so **(call: the server can't hold it, because the encryption may change before then)** | nothing                                     |

Database work: new tables and RPCs go in **additive migrations**, with RLS and tests in `supabase/tests`. They are **not pushed** to the hosted project without the owner's go-ahead (a standing rule).

---

## Constraints carried over (standing owner rules)

- Never reset the production database; additive migrations only; no destructive DB operations without authorisation.
- No service-role keys in bundles; never print or commit secrets.
- No plaintext or private keys to Supabase, analytics, push payloads or logs.
- Don't trust client-supplied user ids for authorisation.
- Don't overwrite env files with placeholders; don't remove lockfiles or upgrade dependencies at random (new ones are pinned exactly).
- No admin dashboard or plaintext access.
- Don't fabricate test results.
- Migrations 0012, 0013 and any new ones are pushed only on the owner's word.

## Left to the builder

- Exact component structure and file layout, following the existing patterns (`features/*`, `packages/core` for shared rules).
- The exact light-mode hexes and personal-tone palettes per look, within the descriptions above. Contrast tests decide.
- Copy for new screens: plain, warm, sentence case.
- The order of features within a wave.

## Verification for the whole round

- `pnpm check` passes (format, lint, typecheck, all tests, build).
- New database tests for every RPC and RLS change.
- Gallery screenshots for every look × mode × high contrast; the impeccable finish review; DESIGN.md replaced.
- Not possible here and stated as such: real-device runs, hosted email delivery, and the hosted Supabase template change.

---

## 6. Phone verification and contact sync (switched off until SMS is connected)

**The owner's intent:** friends are added by hand by username only. Separately, a person who has verified their phone number can find friends from their phone contacts, among people who also verified their number. **The owner left the cost question to the designer.** The call: build it fully now and keep it behind a switch, so nothing costs money and nobody sees a flow that can't send texts until the owner connects an SMS provider (Twilio, Vonage or MessageBird) to the hosted Supabase project.

### The switch

`VITE_PHONE_VERIFICATION` and `EXPO_PUBLIC_PHONE_VERIFICATION`, set to `on` to show the feature; it is off by default. While it's off, no phone verification or contact sync UI appears anywhere. DEPLOYMENT.md gets the steps for connecting an SMS provider in Supabase (Auth → Providers → Phone) and turning the switch on.

### Verify your number (web and mobile)

- Settings → Phone number: country picker plus number, normalised to E.164 with `libphonenumber-js` (new dependency, exact version).
- `supabase.auth.updateUser({ phone })` sends an SMS code. The person enters 6 digits; `verifyOtp({ phone, token, type: 'phone_change' })` confirms it. Resend after 60 s.
- On success the verified number lives in `auth.users.phone` (with `phone_confirmed_at`). The existing self-entered `profiles` phone field stays separate and is never used for matching **(call)**.
- Settings shows "Verified" and offers **Change number** and **Remove number**. Removing it also removes the person from matching.
- **"Let people who have my number find me":** turned on when the number is verified, and can be turned off (`user_settings.discoverable_by_phone`, additive column).

### Find friends from contacts (mobile only: browsers can't read contacts)

- Shown only to people with a verified number. Entry points:
  - the Friends screen ("Find friends from contacts");
  - the fresh-account empty state, as a third action when the switch is on.
- It asks for contacts permission with `expo-contacts` (new dependency, exact version; usage strings in `app.json`). Denying it leaves everything else working.
- **On the device:**
  1. Normalise each contact number to E.164, using the person's own country as the default region.
  2. Drop invalid numbers and their own number.
  3. Hash each as `SHA-256("vybora:phone:v1:" + E164)`.
  4. Send only the hashes, at most 2000 per sync **(call)**. Names never leave the device.
- **On the server:** a `security definer` RPC `match_contacts(p_hashes text[])` (`search_path = ''`, acts as `auth.uid()`):
  - **Requires:** the caller's own number is verified.
  - **Matches:** against `private.phone_directory(user_id, phone_hash)`. A trigger on `auth.users` keeps that table up to date, holding rows only for verified numbers whose owner allows discovery.
  - **Excludes:** self, blocked pairs either way, and inactive accounts.
  - **Returns:** `user_id, username, display_name, avatar_path` and a relationship (`none / friends / request_sent / request_received`). It never returns phone numbers.
  - **Keeps nothing:** the uploaded hashes are not stored.
  - **Limits:** at most 10 syncs a day per user **(call)**; RLS on with all grants revoked on the directory table.
- **Results:** a "Friends from your contacts" list. Each row shows the person's avatar, name and @username, plus **Add friend** (a normal friend request), "Requested", "Respond" or "Friends". The device can show the contact's own name from the address book beside it, which stays local.
- **Honest copy:** "Your contacts' numbers are scrambled before they're sent and aren't kept. Phone numbers are guessable, so this isn't secret from VYBORA. Only people who verified their number and allow it can be found."
- **Docs to update:**
  - CONNECT.md: replace "Address books are never uploaded and there is no contact discovery by phone number" with the description above.
  - SECURITY.md: add a section on contact sync.
  - PRODUCT.md: phone verification is optional; usernames are still how you add people by hand.

### Tests

- Database tests:
  - the trigger maintains the directory (verify, unverify, opt-out, delete);
  - `match_contacts` (requires a verified caller, excludes blocked and inactive people, never returns numbers, caps at 2000, rate limit, anon denied).
- API and component tests: number normalisation and hashing (shared in `packages/core`, same output on web and mobile), the verify flow, the contacts permission-denied path, and that nothing shows while the switch is off.
