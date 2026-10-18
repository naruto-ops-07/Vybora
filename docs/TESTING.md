# Testing

| Suite                                                                                                                                                          | Location                            | Runner                                   | Needs backend?                                        | Count   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------- | ------- |
| Database, RLS, Storage policies, triggers                                                                                                                      | `supabase/tests`                    | Vitest + PGlite (real Postgres 17, WASM) | No                                                    | 267     |
| Validation schemas                                                                                                                                             | `packages/validation`               | Vitest                                   | No                                                    | 21      |
| Domain logic (tokenizer, cursors, MIME sniffing, errors, permissions, stories)                                                                                 | `packages/core`                     | Vitest                                   | No                                                    | 21      |
| API layer (normalization, signed-URL batching, optimistic cache)                                                                                               | `packages/api`                      | Vitest                                   | No                                                    | 6       |
| Web components (auth forms, profile form, post card optimistic like + rollback, dialogs, states)                                                               | `apps/web/src/**/*.test.tsx`        | Vitest + Testing Library + jsdom         | No                                                    | 20      |
| Mobile components (UI primitives, login screen)                                                                                                                | `apps/mobile/src/__tests__`         | jest-expo + RN Testing Library           | No                                                    | 9       |
| Web E2E smoke (landing, guards, validation, 404/deep links, keyboard focus, no overflow)                                                                       | `apps/web/tests/e2e/smoke.spec.ts`  | Playwright (desktop + Pixel 7)           | No                                                    | 14 runs |
| Web E2E social flows (sign up ×2, profile edit, real upload, follow, like, comment, persistence after refresh, notifications, server-side denial of admin RPC) | `apps/web/tests/e2e/social.spec.ts` | Playwright                               | **Yes** (`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`) | 5       |

## How the database suite works

`supabase/tests/harness/supabase-shim.sql` recreates the parts of a Supabase database the migrations depend on (roles `anon`/`authenticated`/`service_role`, `auth.uid()` reading `request.jwt.claims`, `storage.objects`/`buckets`, Supabase's default grants, the realtime publication). `TestDb.as(actor, sql)` runs each statement in a transaction after `SET LOCAL ROLE` + JWT claims — exactly how PostgREST executes requests — so RLS, column grants, triggers and deferred constraints behave as in production. Storage uploads are simulated by inserting into `storage.objects` under the same RLS.

The suite runs twice (two Vitest projects in `supabase/tests/vitest.config.ts`): **defaults**, where the shim installs Supabase's old default privileges, and **strict**, without them, like newer hosted projects, where an API role can use only what a migration grants explicitly. `explicit-grants.test.ts` (runs once) requires both modes to end with the same privileges for `anon`, `authenticated` and `service_role`. If a new migration relies on default privileges, it fails and prints the missing `grant` statements: add them to that migration if it isn't applied anywhere yet, otherwise write a new migration with `pnpm db:grants supabase/migrations/<timestamp>_explicit_client_grants.sql`. Never edit an applied migration. One mode only: `pnpm --filter @vybora/db-tests exec vitest run --project strict`.

Limits of the shim: it does not run GoTrue, the Storage API server or Realtime. Those integrations are covered by `social.spec.ts` against a real stack (run in CI's `e2e-supabase` job).

## Commands

```bash
pnpm test        # everything except Playwright
pnpm test:db     # database suite only
pnpm test:e2e    # Playwright (builds and serves the web app)
E2E_SUPABASE_URL=http://127.0.0.1:54321 E2E_SUPABASE_ANON_KEY=... pnpm test:e2e   # include social flows
```

## Not yet covered

- On-device mobile tests (camera roll permission denial, push delivery, deep links from email, network interruption on real radios). The JS bundles compile for iOS and Android (`expo export`), and `expo-doctor` passes 20/21 checks (the failing check is "not a git repository" on the dev machine).
- Realtime delivery is exercised in code paths but not asserted by an automated test against a live Realtime server.
- Load/performance testing.
