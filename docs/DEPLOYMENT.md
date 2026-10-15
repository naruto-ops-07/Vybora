# Deployment

Nothing in this document has been executed against real infrastructure yet; it is the intended, reproducible procedure.

## 1. Supabase (backend)

1. Create a project (staging first, then production). Note the URL, anon/publishable key and service-role key.
2. Link and push migrations:
   ```bash
   supabase link --project-ref <ref>
   supabase db push            # review the plan before confirming
   ```
3. **Auth → URL configuration**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, `https://<your-domain>/reset-password`, `vybora://auth/callback`
   - Enable email confirmations (production). Configure custom SMTP for deliverability.
4. **Storage:** buckets and policies are created by migration `0007`. Verify in the dashboard that `media` and `dm` are private.
5. **Realtime:** `messages` and `notifications` are added to `supabase_realtime` by migration `0007`.
6. **Edge Functions**
   ```bash
   supabase secrets set CRON_SECRET=<random> WEBHOOK_SECRET=<random> ALLOWED_ORIGIN=https://<your-domain> [EXPO_ACCESS_TOKEN=...]
   supabase functions deploy delete-account
   supabase functions deploy cleanup-media
   supabase functions deploy send-push
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.)
7. **Schedule cleanup** (every 30 min) with pg_cron + pg_net, or any external scheduler, calling
   `POST https://<ref>.functions.supabase.co/cleanup-media` with header `x-cron-secret: <CRON_SECRET>`.
8. **Push webhook:** Database → Webhooks → on `INSERT` into `public.notifications` → HTTP POST to the `send-push` function URL with header `x-webhook-secret: <WEBHOOK_SECRET>`.
9. Grant the first admin via the SQL editor (see README).

### OAuth providers (optional)

Not wired in the UI yet. To add: enable the provider in Auth, add its redirect URL, then call `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: <site>/auth/callback } })`. The callback route already handles PKCE code exchange.

## 2. Web (Vercel)

- Import the repo, set **Root Directory** to `apps/web` (build/install commands come from `apps/web/vercel.json`).
- Environment variables (Preview + Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, optional `VITE_SENTRY_DSN`.
- SPA rewrites in `vercel.json` make deep links (`/p/:id`, `/u/:username`, nested settings/admin routes) work on refresh.
- Use separate Supabase projects for preview and production.

## 3. Mobile (Expo EAS)

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init            # writes extra.eas.projectId into app.json (required for push tokens)
npx eas-cli@latest env:create      # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY / _SITE_URL per environment
npx eas-cli@latest build --profile development --platform all   # dev client
npx eas-cli@latest build --profile preview --platform android   # internal APK
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios|android
```

Before store submission: set real `ios.bundleIdentifier` / `android.package` (currently `app.vybora.mobile`), configure APNs/FCM credentials via EAS, host `apple-app-site-association` and `assetlinks.json` on your domain if you keep the universal-link intent filters, and complete privacy questionnaires (photo library usage, user-generated content with reporting/blocking — already implemented).

## 4. Monitoring

Set `VITE_SENTRY_DSN` to enable Sentry on the web (loaded lazily, PII disabled). Mobile Sentry is not yet integrated (`@sentry/react-native` + its Expo config plugin would be the path). Watch Supabase logs/advisors for slow queries and RLS warnings.

## Rollback & backups

- Web: Vercel instant rollback to a previous deployment.
- Mobile: EAS Update channels for JS-only fixes; native changes need a new build.
- Database: forward-fix migrations; take `supabase db dump` before risky migrations; enable PITR on production. Never auto-apply destructive migrations — CI does not deploy the database.
