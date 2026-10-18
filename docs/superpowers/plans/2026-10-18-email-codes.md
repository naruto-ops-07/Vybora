# Email codes (verify sign-up, sign in by code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New accounts are verified by typing a 6-digit emailed code, and people can optionally sign in with an emailed code, on web and mobile.

**Architecture:**

- **Shared pieces:** the rules (code shape, paste clean-up, error copy, cooldown) live in `packages/validation` and `packages/core`; the Supabase calls live in `packages/api/src/auth.ts`.
- **Code screen:** one code-entry step per app (web route component, mobile feature component) serves both sign-up and sign-in.
- **Email link fallback:** the existing link (`/auth/callback`) keeps working.
- **Email templates:** checked in under `supabase/templates/` and wired in `supabase/config.toml`, so local and hosted match.

**Tech Stack:** Supabase Auth (`verifyOtp`, `signInWithOtp`, `resend`), zod, React 19 + react-router (web), Expo Router + React Native (mobile), Vitest, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-10-18-premium-themes-features-design.md`, section 1. UI tasks (2, 3) are implemented by a **Claude Fable 5.1** subagent (`model: "fable"`); task 1 by the default model. Opus reviews every task.

## Global Constraints

- **Code:** exactly 6 digits. Resend is allowed again after **60 s**. Codes expire in **10 minutes** (hosted setting; local `otp_expiry = 600`).
- **Neutral sign-in message, verbatim:** "If there’s an account for that email, we’ve sent a code." The code field is always shown after a send, whether or not the account exists.
- **Wrong or expired code, verbatim:** "That code didn’t work. Check it or send a new one."
- **Already registered at sign-up:** "That email already has an account". Offer **Sign in with a code** and **Sign in with password**.
- **Password sign-in stays the default.** Password reset keeps the emailed link.
- **Email is never put in a URL.** Pass it in router state (web) or in-memory params (mobile).
- **No new dependencies.** Don't touch lockfiles, env files or the hosted Supabase project.
- **UI:** current look and components (theme work comes in part 3), sentence case, ≥ 44 px touch targets, labelled fields. The code field gets `autocomplete="one-time-code"` (web) or `textContentType="oneTimeCode"` / `autoComplete="one-time-code"` (mobile), and is announced as "Verification code".
- **Copy:** use typographic apostrophes (’), as the rest of the app's copy does.
- **Tests:** real output only; never claim results that weren't observed.

## Review Focus

1. A pasted code with spaces or a dash ("123 456", "123-456") or extra text fills all six boxes with the digits.
2. A fast double tap, or auto-submit on the 6th digit plus a press on Verify, sends exactly one verify request.
3. Signing in by code with an email that has no account shows the same neutral screen, with no error and no difference in timing UI.
4. An expired or wrong code shows the error, keeps the email, clears the boxes, focuses the first box, and leaves Resend usable once its cooldown ends.
5. "Use a different email" returns to the form with the email prefilled, and clears the code and the cooldown.

---

### Task 1: Code rules, auth API and email templates

**Files:**

- Modify: `packages/validation/src/index.ts`, `packages/validation/src/index.test.ts`
- Create: `packages/core/src/emailCode.ts`, `packages/core/src/emailCode.test.ts`; Modify: `packages/core/src/index.ts`
- Modify: `packages/api/src/auth.ts`; Create: `packages/api/src/auth.test.ts`
- Create: `supabase/templates/confirmation.html`, `supabase/templates/magic_link.html`; Modify: `supabase/config.toml`
- Modify: `docs/DEPLOYMENT.md` (hosted email-template and OTP settings, as steps for the owner)

**Interfaces:**

- **Produces, `@vybora/validation`:** `emailCodeSchema: z.ZodString`. It trims, then requires `/^\d{6}$/`, with the message "Enter the 6-digit code".
- **Produces, `@vybora/core`:**
  - `EMAIL_CODE_LENGTH = 6`
  - `EMAIL_CODE_RESEND_SECONDS = 60`
  - `SIGN_IN_CODE_SENT = "If there’s an account for that email, we’ve sent a code."`
  - `digitsFromCode(text: string): string`: digits only, at most 6.
  - `emailCodeError(error: unknown): string`
- **Produces, `@vybora/api`:**
  - `sendSignInCode(client: VyboraClient, email: string): Promise<void>`
  - `verifyEmailCode(client: VyboraClient, input: { email: string; code: string; purpose: 'signup' | 'signin' }): Promise<void>`
  - The existing `resendConfirmation(client, email, emailRedirectTo?)` is reused for resending sign-up codes.

- [ ] **Step 1: Write the failing tests**

`packages/validation/src/index.test.ts`:

```ts
it('accepts a 6-digit code and rejects anything else', () => {
  expect(emailCodeSchema.parse(' 123456 ')).toBe('123456');
  for (const bad of ['12345', '1234567', '12a456', ''])
    expect(emailCodeSchema.safeParse(bad).success).toBe(false);
});
```

`packages/core/src/emailCode.test.ts`:

```ts
it('keeps only the digits of a pasted code, at most six', () => {
  expect(digitsFromCode('123 456')).toBe('123456');
  expect(digitsFromCode('Your code: 123-456.')).toBe('123456');
  expect(digitsFromCode('12345678')).toBe('123456');
  expect(digitsFromCode('abc')).toBe('');
});
it('maps code errors to plain copy', () => {
  expect(emailCodeError({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe(
    'That code didn’t work. Check it or send a new one.',
  );
  expect(emailCodeError({ status: 429, code: 'over_email_send_rate_limit', message: 'x' })).toBe(
    'Too many tries. Wait a minute, then try again.',
  );
  expect(emailCodeError(new TypeError('Failed to fetch'))).toMatch(/offline|connection/i);
});
```

`packages/api/src/auth.test.ts` (fake client: `{ auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } } as unknown as VyboraClient`):

```ts
it('asks for a sign-in code without creating users', async () => {
  await sendSignInCode(client, ' Maya@Example.com ');
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'maya@example.com',
    options: { shouldCreateUser: false },
  });
});
it('stays silent when there is no account (no enumeration)', async () => {
  auth.signInWithOtp.mockResolvedValue({
    error: { code: 'otp_disabled', message: 'Signups not allowed for otp' },
  });
  await expect(sendSignInCode(client, 'nobody@example.com')).resolves.toBeUndefined();
});
it('passes rate limits through', async () => {
  const err = { status: 429, code: 'over_email_send_rate_limit', message: 'rate' };
  auth.signInWithOtp.mockResolvedValue({ error: err });
  await expect(sendSignInCode(client, 'a@b.co')).rejects.toBe(err);
});
it('verifies with the right Supabase type per purpose', async () => {
  auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
  await verifyEmailCode(client, { email: 'A@b.co', code: '123 456', purpose: 'signup' });
  expect(auth.verifyOtp).toHaveBeenLastCalledWith({
    email: 'a@b.co',
    token: '123456',
    type: 'signup',
  });
  await verifyEmailCode(client, { email: 'a@b.co', code: '123456', purpose: 'signin' });
  expect(auth.verifyOtp).toHaveBeenLastCalledWith({
    email: 'a@b.co',
    token: '123456',
    type: 'email',
  });
});
it('rejects a malformed code before calling Supabase, and surfaces verify errors', async () => {
  await expect(
    verifyEmailCode(client, { email: 'a@b.co', code: '12', purpose: 'signin' }),
  ).rejects.toThrow();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  auth.verifyOtp.mockResolvedValue({
    data: { session: null },
    error: { code: 'otp_expired', message: 'x' },
  });
  await expect(
    verifyEmailCode(client, { email: 'a@b.co', code: '123456', purpose: 'signin' }),
  ).rejects.toMatchObject({ code: 'otp_expired' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @vybora/validation test`, `pnpm --filter @vybora/core test`, `pnpm --filter @vybora/api test`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement**

- **`emailCodeSchema`:** in validation.
- **`emailCode.ts` (core):**
  - Export the constants and `digitsFromCode`.
  - `emailCodeError` maps codes `otp_expired` / `invalid_otp` (or a message containing "expired or is invalid") to the wrong-code copy, and status 429 / `over_email_send_rate_limit` to "Too many tries. Wait a minute, then try again."
  - Everything else goes to `friendlyError`.
- **`sendSignInCode`:**
  - Parse the email with `emailSchema`, then call `signInWithOtp({ email, options: { shouldCreateUser: false } })`.
  - Swallow errors whose `code` is `otp_disabled` or `user_not_found`, or whose message matches `/signups not allowed/i`. Throw everything else.
- **`verifyEmailCode`:**
  - Parse the email with `emailSchema` and the code with `emailCodeSchema`.
  - Use `type` `'signup'` or `'email'` according to the purpose.
  - Throw the Supabase error. If there is no session, throw `new Error('no_session')`.
- **Re-exports:** add both functions to the auth exports in `packages/api/src/index.ts` (if auth is re-exported explicitly).
- **Email templates:**
  - Use plain, minimal HTML with the `VYBORA` wordmark text. Show the code `{{ .Token }}` large, the line "This code expires in 10 minutes.", and the link fallback `{{ .ConfirmationURL }}`.
  - Add the line "If you didn’t ask for this, you can ignore this email."
  - Include no tracking pixels and no remote images.
- **`supabase/config.toml`:**
  - Under `[auth.email]` add `otp_length = 6` and `otp_expiry = 600`.
  - Add `[auth.email.template.confirmation]` (subject "Your VYBORA code", `content_path = "./supabase/templates/confirmation.html"`) and `[auth.email.template.magic_link]` (subject "Your VYBORA sign-in code", `content_path = "./supabase/templates/magic_link.html"`).
  - Keep `enable_confirmations = false` (needed by the E2E tests).
- **DEPLOYMENT.md:** add an "Email codes" section for the hosted project: paste both templates (Auth → Email Templates), set the OTP length to 6 and the expiry to 600 s, and keep "Confirm email" on. Mark it as a step for the owner.

- [ ] **Step 4: Run the tests and confirm they pass**

Run the three commands from Step 2, plus `pnpm --filter @vybora/api typecheck` and `pnpm --filter @vybora/core typecheck`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation packages/core packages/api supabase/templates supabase/config.toml docs/DEPLOYMENT.md
git commit -m "feat(auth): email code rules, verify/sign-in-code API and email templates"
```

---

### Task 2: Web — code step at sign-up and sign in by code (Fable 5.1)

**Files:**

- Create: `apps/web/src/routes/auth/EmailCodeStep.tsx`, `apps/web/src/routes/auth/emailCode.test.tsx`
- Modify: `apps/web/src/routes/auth/Signup.tsx`, `apps/web/src/routes/auth/Login.tsx`, `apps/web/src/routes/auth/LoginForm.tsx`

**Interfaces:**

- **Consumes (Task 1):**
  - From `@vybora/core`: `digitsFromCode`, `emailCodeError`, `EMAIL_CODE_LENGTH`, `EMAIL_CODE_RESEND_SECONDS`, `SIGN_IN_CODE_SENT`.
  - From `@vybora/api`: `sendSignInCode`, `verifyEmailCode`, `resendConfirmation`.
- **Produces:** `EmailCodeStep(props: { email: string; purpose: 'signup' | 'signin'; onVerified: () => void; onResend: () => Promise<void>; onChangeEmail: () => void })`, the screen body inside `AuthLayout`.

Behaviour:

- **Six boxes, one per digit:**
  - Typing a digit advances to the next box; Backspace in an empty box goes back.
  - Pasting anywhere fills the boxes from `digitsFromCode`.
  - The 6th digit auto-submits.
  - The **Verify** button submits too.
  - A single in-flight guard prevents double submits.
- **Accessibility:** the group is labelled "Verification code" with `autocomplete="one-time-code"` and `inputMode="numeric"`.
- **Resend:** the button shows "Resend code in 0:59" (counting down from 60 s), then "Resend code".
- **Errors:** shown in the existing `FormError`, using `emailCodeError`.
- **Sign-up:**
  - When `signUp` returns `confirm_email`, render `AuthLayout` titled "Enter the code" with subtitle "We sent a 6-digit code to **{email}**." and `<EmailCodeStep purpose="signup">`.
  - Below it, the line "You can also open the link in the email on this device." The existing `rememberNext` and callback fallback stay.
  - On verified, go to `navigate(safeNext(next), { replace: true })`.
  - On `already_registered`, render "That email already has an account" with **Sign in with a code** (routes to `/login` with state `{ email, useCode: true }`) and **Sign in with password** (routes to `/login` with state `{ email }`).
- **Sign in:**
  - `LoginForm` gains a secondary text button, **Email me a code instead**. It switches to a code request form (email field plus **Send code**) and back ("Use password instead").
  - Pressing Send code calls `sendSignInCode`, then shows `SIGN_IN_CODE_SENT` as the subtitle with `<EmailCodeStep purpose="signin">`. On verified, go to `safeNext(next)`.
  - Router state `{ email, useCode }` prefills.

- [ ] **Step 1: Write the failing tests** in `emailCode.test.tsx`

Mock `@vybora/api` as `next.test.tsx` does, and use `renderWithProviders` with routes for `/login`, `/signup` and `*`.

- `it('verifies a sign-up with the emailed code and continues to next')`: `signUp` resolves `confirm_email`. After filling the sign-up form, "Enter the code" shows. Paste `'123 456'` into the first box; expect `verifyEmailCode` called once with `{ email: 'new@example.com', code: '123456', purpose: 'signup' }`, and `where` shows `NEXT`.
- `it('sends exactly one verify for auto-submit plus a Verify click')`.
- `it('shows the wrong-code message, clears the boxes and keeps the email')`: `verifyEmailCode` rejects `{ code: 'otp_expired' }`; expect "That code didn’t work. Check it or send a new one."; every box is empty; focus is on the first box.
- `it('counts down before resend is allowed')`, with fake timers: the button is disabled at 0 s, shows "Resend code in 0:59" after 1 s, is enabled at 60 s, and pressing it calls `resendConfirmation`.
- `it('offers code or password sign-in for an existing email')`: `signUp` resolves `already_registered`. Pressing **Sign in with a code** lands on `/login` in code mode with the email prefilled, and the URL contains no email.
- `it('signs in by code and shows the same message whether or not an account exists')`: `sendSignInCode` resolves; expect the text `If there’s an account for that email, we’ve sent a code.` and the code boxes. Verify resolves, and you land on `/messages`.
- `it('goes back to the form with the email kept when using a different email')`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @vybora/web exec vitest run src/routes/auth/emailCode.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `EmailCodeStep` and the Signup / Login / LoginForm changes above, reusing `Button`, `FormError` and `AuthLayout`.

- [ ] **Step 4: Run the tests and confirm they pass, together with the existing auth tests**

Run: `pnpm --filter @vybora/web exec vitest run src/routes/auth` then `pnpm --filter @vybora/web typecheck` and `pnpm --filter @vybora/web lint`
Expected: PASS. `auth.test.tsx` and `next.test.tsx` still pass; the confirm-email flow test there is updated from "Check your inbox" to "Enter the code".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/auth
git commit -m "feat(web): verify sign-up with an email code; sign in by code"
```

---

### Task 3: Mobile — code step at sign-up and sign in by code (Fable 5.1)

**Files:**

- Create: `apps/mobile/src/features/auth/EmailCodeStep.tsx`, `apps/mobile/src/__tests__/emailCode.test.tsx`
- Modify: `apps/mobile/src/app/(auth)/signup.tsx`, `apps/mobile/src/app/(auth)/login.tsx`

**Interfaces:**

- **Consumes:** the same Task 1 exports.
- **Produces:** `EmailCodeStep(props: { email: string; purpose: 'signup' | 'signin'; onResend: () => Promise<void>; onChangeEmail: () => void })`. A successful verify sets the session, and the existing auth layout redirects to the inbox, so there is no `onVerified`.

Behaviour (the mobile twin of Task 2):

- **One field for the code:** a single hidden `TextInput` (`keyboardType="number-pad"`, `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, `maxLength={6}`, `accessibilityLabel="Verification code"`) drives six visual boxes. The value is filtered through `digitsFromCode`. The 6th digit auto-submits behind an in-flight guard.
- **Feedback:**
  - Haptic `light` on success, through `useHaptics`.
  - Errors in `FormError`; the field is cleared and refocused.
- **Resend:** "Resend code in 0:59" counts down from 60 s.
- **Sign-up:**
  - `confirm_email` replaces the "Check your inbox" link screen with "Enter the code" and the subtitle "We sent a 6-digit code to {email}."
  - `already_registered` shows "That email already has an account" with **Sign in with a code** and **Sign in with password**. Both open `/login` with in-memory route params `{ email, useCode? }`.
  - Use `router.push({ pathname: '/login', params })`. If typed routes reject it, pass the params through a small module-level handoff, never the URL.
- **Login:**
  - Add "Email me a code instead" and "Use password instead".
  - Send code calls `sendSignInCode`, then shows `SIGN_IN_CODE_SENT` and the step.

- [ ] **Step 1: Write the failing tests** in `apps/mobile/src/__tests__/emailCode.test.tsx`

Mock `@vybora/api`, `@/lib/supabase`, `expo-router` and `expo-haptics` as `login.test.tsx` does. Cover these cases:

- `it('verifies a sign-up code typed or pasted with spaces')`: `changeText` on "Verification code" with `'123 456'` → `verifyEmailCode` called once with `{ email, code: '123456', purpose: 'signup' }`.
- `it('shows the wrong-code message and clears the field')`.
- `it('counts down before resend')`, with fake timers.
- `it('signs in by code with the neutral message')`.
- `it('offers code or password sign-in for an existing email')`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @vybora/mobile exec jest src/__tests__/emailCode.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the component and the screen changes above.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @vybora/mobile test` then `pnpm --filter @vybora/mobile typecheck` and `pnpm --filter @vybora/mobile lint`
Expected: PASS, including the existing `login.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/features/auth" "apps/mobile/src/app/(auth)" apps/mobile/src/__tests__/emailCode.test.tsx
git commit -m "feat(mobile): verify sign-up with an email code; sign in by code"
```

---

### Finish

- `pnpm check` exits 0 (record the real counts).
- Add a CHANGELOG entry and a FEATURE_STATUS row ("Email codes": web and mobile ✅ components; hosted templates **need the owner's step in DEPLOYMENT.md**).
- Not verifiable here, and stated as such: real email delivery, and the hosted template change.
