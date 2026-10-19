# VYBORA handoff prompt (2026-10-19)

Paste the prompt below into a new Claude Code session opened at `C:\Users\Aditya Vardhan\Documents\vybora`.

---

You are continuing work on **VYBORA**, an end-to-end encrypted messenger for young social users. It is a pnpm/turbo monorepo:

- **Web:** `apps/web`, built with React 19, Vite, Tailwind 4 and Radix.
- **Mobile:** `apps/mobile`, built with Expo 57 and React Native 0.86.
- **Shared code:** `packages/config` (design tokens), `packages/core` (shared rules), `packages/api` (Supabase calls), `packages/e2ee` (MLS encryption) and `packages/validation`.
- **Database:** `supabase/migrations`, plus a test suite in `supabase/tests`.

All work is on branch `feat/friends`. It has not been pushed and there is no remote.

## How to work

- **Models:** use Claude Opus 5.5 only, at top visual craft. The owner has no credits for Fable.
- **Process:** use the superpowers subagent-driven workflow. For each task: implementer, then reviewer, then a fix round, then a scoped re-review. Keep a ledger in `.superpowers/sdd/<plan>/progress.md`.
- **Language:** the owner prefers plain-language, step-by-step guidance.

## Hard rules

- Never reset or destructively change the production database. Migrations must be additive only, and an applied migration must never be edited.
- The owner applies migrations with `pnpm db:push` after `pnpm db:status`. The CLI is already linked.
- Never call the hosted Supabase project (`skznrtrmclumubgtgznm`) from tests or agents. Never sign in or sign up against it. Do visual checks only in the dev-only `/__gallery` route, with network access blocked.
  - This rule exists because an agent once created a real user on the hosted project.
- Never expose service-role keys, and never print or commit secrets. Don't edit `.env` files or lockfiles unless a planned dependency requires it.
- Never send plaintext messages or keys to Supabase, push notifications or logs. Never claim an independent audit or "Signal-equivalent" security.
- Don't fabricate test results.
- **Accessibility still binds:**
  - WCAG AA everywhere, and 7:1 in high-contrast mode.
  - Touch targets of at least 44 px.
  - Reduced motion is respected.
  - Text size follows the per-device setting.
  - Icons come from Phosphor; never use emoji as icons; use sentence case.
- The old rules (flat, no gradients, no shadows) were dropped on 2026-10-18.

## What is done

- **Friends by username:**
  - Requests, "only friends can message me" privacy, personal colour tones and illustrations.
  - The Get started panel, the HandleCard, sealed-send and friendship-joined moments.
  - All of it on web and mobile.
- **Email codes:**
  - Sign-up verification by a 6-digit code, and optional sign-in by code, on web and mobile.
  - Templates live in `supabase/templates`.
  - The owner set up Gmail SMTP (`vybora.noreply@gmail.com`).
- **Fixes:**
  - The mobile PKCE polyfill.
  - Clearer auth error messages.
  - Migration `0014`: explicit permission grants (this fixed "Say hi" returning "permission denied"), plus a strict test mode and a drift guard.
- **New look, Tasks 1–4 of plan `docs/superpowers/plans/2026-10-18-new-look.md`:**
  - Velvet (the default), Aurora and Bloom, each with light and dark.
  - Tokens in `packages/config/src/looks.ts`.
  - Web foundation and Settings → Appearance.
  - Restyled web primitives.
  - Web workspace, including the fresh-account empty state and the Received/Sent request tabs.
- **Task 5** (landing, auth, 404 and screenshots) is committed as `173d096`, but its review asked for fixes. The fix round has **not been done**.

## Next steps

1. **Task 5 fix round:**
   - Remove the two eyebrow labels above the landing feature columns ("With your people" and "Between you only").
   - Make the landing header's Sign in and Create account buttons at least 44 px tall.
   - Check that the "How a message travels" step text meets 4.5:1 in every look.
   - Add the signup page and the email-code step to `apps/web/scripts/gallery-shots.mjs`.
   - Move `routes/landing/Ambient.tsx` into `components/`.
   - Then run a scoped re-review.
2. **Tasks 6–8 of the new-look plan:**
   - Task 6: mobile foundation, fonts and Appearance.
   - Task 7: every mobile screen.
   - Task 8: docs, `pnpm check`, impeccable detect, the `impeccable-finish-reviewer` and `impeccable-documenter` agents (they write `DESIGN.md`), then a final whole-branch review.
3. **Remaining parts of the spec** `docs/superpowers/specs/2026-10-18-premium-themes-features-design.md`, in owner order:
   - Part 2: app lock on web and mobile, plus per-chat lock.
   - Part 4: WhatsApp parity, wave A (edit, forward, star, pin, @mentions, reply privately, message info, search, contact cards, location, view once, polls).
   - Part 5: wave B (invite links, link previews, chat lock, folders, Notes to self, quiet hours, a timer on a single message, send later).
   - Part 6: phone verification and contact sync, kept behind the `*_PHONE_VERIFICATION` switch.
   - Each part gets its own plan via the writing-plans skill.
4. **Deferred minors:** these are listed in the ledgers under `.superpowers/sdd/`. Triage them in the final reviews.
5. **Later, with the owner:** decide how to merge `feat/friends` into `main`. Calls and Status are planned for the next round.

## Commands

- `pnpm check`: format, lint, typecheck, all tests and the web build.
- `pnpm test:db`: the database suite, run both with and without default privileges.
- `pnpm theme:css`: regenerates `looks.generated.css`; the result must match the committed file.
- `pnpm dev`: runs the web app at http://localhost:5173.
- `pnpm dev:mobile`: runs the mobile app in Expo Go.
