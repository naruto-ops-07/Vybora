/**
 * What "That email already has an account" on sign-up hands to the sign-in
 * screen. Held in memory and read once, so the email never goes into a route:
 * expo-router turns params on `/login` into the URL's query string
 * (`resolveHref`), which is exactly where an address must not appear.
 */
export interface LoginHandoff {
  email: string;
  /** Open on "Send code" instead of the password form. */
  useCode: boolean;
}

let pending: LoginHandoff | null = null;

export function handOffToLogin(handoff: LoginHandoff): void {
  pending = handoff;
}

/** The waiting handoff, if any. Reading it clears it. */
export function takeLoginHandoff(): LoginHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}
