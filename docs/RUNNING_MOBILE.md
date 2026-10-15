# Running the VYBORA mobile app on your phone

The fastest path uses a **free hosted Supabase project** (no Docker needed) and **Expo Go** on your phone. About 15 minutes the first time.

## 1. Create the backend (once)

1. Sign in at <https://supabase.com> → **New project** (free tier). Save the database password.
2. Apply the database schema from the repo root (PowerShell):

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref <your-project-ref>   # ref is in the project URL
   npx supabase@latest db push                                  # applies supabase/migrations
   ```

   No CLI? Paste each file from `supabase/migrations/` into **SQL Editor → New query** and run them **in filename order** (0001 → 0008).

3. **Authentication → Sign In / Providers → Email:** for a development project, turn **Confirm email** _off_ so new accounts can sign in immediately from Expo Go.
   (Keeping it on? Add `exp://**` and `vybora://auth/callback` under **Authentication → URL Configuration → Redirect URLs**, and open the email link on the phone.)

4. **Project Settings → API keys:** copy the **Project URL** and the **anon / publishable** key. Never use the `service_role` / secret key in the app.

## 2. Configure the app

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
EXPO_PUBLIC_SITE_URL=http://localhost:5173
```

If either value is missing or invalid, the app opens on a **Configuration required** screen telling you which one.

## 3. Run it

1. Install **Expo Go** from the App Store / Play Store (it must support SDK 57 — the current store version does).
2. Put the phone on the **same Wi-Fi** as your PC.
3. From the repo root:

   ```powershell
   pnpm install
   pnpm dev:mobile
   ```

4. Scan the QR code — Android: in Expo Go; iPhone: with the Camera app. Allow Windows Firewall access for Node if prompted.

If the phone can't connect (office/guest Wi-Fi), use a tunnel:

```powershell
pnpm --filter @vybora/mobile start --tunnel
```

**Android emulator instead of a phone:** install Android Studio, start a virtual device, then press `a` in the Expo terminal.

## 4. Try it out

- Sign up two accounts (e.g. on your phone and on the web app with `pnpm dev`) to test follows, likes, comments, stories and realtime DMs between them.
- Optional demo data (4 accounts with posts, a story and a DM). This needs the **service_role** key, so run it only on your own machine and only against a dev project:

  ```powershell
  $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_ANON_KEY="<anon>"; $env:SUPABASE_SERVICE_ROLE_KEY="<service-role>"
  node scripts/seed-demo.mjs --allow-remote
  ```

- Make yourself an admin (for the web admin console) in **SQL Editor**:

  ```sql
  insert into public.user_roles (user_id, role)
  select id, 'admin' from public.profiles where username = '<your-username>';
  ```

## What works in Expo Go vs. needs more setup

| Works in Expo Go                                                                                                                                                                  | Needs extra setup                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up/in, feeds, posting photos & videos, stories, reels, comments, likes, saves, follows, private accounts, block/mute, search, realtime DMs with photos, in-app notifications | **Push notifications** — need a development build (`eas build --profile development`) and an EAS project id (`npx eas-cli@latest init`); see [DEPLOYMENT.md](DEPLOYMENT.md) |
|                                                                                                                                                                                   | **Delete account** — needs the `delete-account` Edge Function deployed (`npx supabase@latest functions deploy delete-account`)                                              |
|                                                                                                                                                                                   | **Expired-story and orphan-media cleanup** — `cleanup-media` function + a schedule                                                                                          |

## Troubleshooting

| Symptom                                           | Fix                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "Configuration required" screen                   | Check `apps/mobile/.env`, then restart with `pnpm --filter @vybora/mobile start --clear`                                  |
| "Incorrect email or password" right after sign-up | Email confirmation is still on (step 1.3)                                                                                 |
| "You appear to be offline"                        | The URL in `.env` is wrong, or you used `127.0.0.1` — a phone can't reach your PC's localhost; use the hosted project URL |
| Photo picker says access is off                   | Allow Photos access for Expo Go in the phone's Settings                                                                   |
| Metro "unable to resolve @vybora/…"               | Run `pnpm install` from the repo root, then start with `--clear`                                                          |
| Expo Go says the SDK version is unsupported       | Update Expo Go from the store                                                                                             |
