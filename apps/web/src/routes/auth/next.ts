/**
 * Where to go after signing in or up (`?next=`), carried from Login to Signup
 * and, for an emailed confirmation link, across the trip to the inbox.
 */
const DEFAULT_NEXT = '/messages';
const STORAGE_KEY = 'vybora.auth.next';
/** A remembered destination is only good for this sign-up, not a week later. */
const REMEMBER_MS = 24 * 60 * 60 * 1000;

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null | undefined): string {
  // `//host` and `/\host` are protocol-relative to a browser, which also drops
  // tabs and newlines and reads `\` as `/`: refuse control characters and any
  // backslash outright.
  // eslint-disable-next-line no-control-regex
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\u0000-\u001f\\]/.test(next))
    return DEFAULT_NEXT;
  return next;
}

/** `path`, carrying a meaningful `next` along (nothing for the default or an unsafe one). */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNext(next);
  return safe === DEFAULT_NEXT ? path : `${path}?next=${encodeURIComponent(safe)}`;
}

/**
 * An emailed code also carries a link (sign-up confirmation, or sign-in by
 * code): the link opens `/auth/callback` (on this device), which can't carry
 * `?next=` through the redirect allow-list, so the destination waits in this
 * browser for it, tied to the address the code went to so only that account's
 * callback (not some other one) picks it up.
 */
export function rememberNext(next: string | null | undefined, email: string): void {
  const safe = safeNext(next);
  try {
    if (safe === DEFAULT_NEXT) localStorage.removeItem(STORAGE_KEY);
    else
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ next: safe, email: email.trim().toLowerCase(), at: Date.now() }),
      );
  } catch {
    /* storage unavailable: the callback goes to the default */
  }
}

/**
 * The destination remembered for `email` (once: it is then cleared),
 * or the default. Another account's callback leaves it for its owner; a stale
 * or unreadable one is dropped.
 */
export function takeRememberedNext(email: string | null | undefined, now = Date.now()): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NEXT;
    const saved = JSON.parse(raw) as { next?: unknown; email?: unknown; at?: unknown };
    const { next, at } = saved;
    if (typeof next !== 'string' || typeof at !== 'number' || now - at > REMEMBER_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_NEXT;
    }
    if (!email || saved.email !== email.trim().toLowerCase()) return DEFAULT_NEXT;
    localStorage.removeItem(STORAGE_KEY);
    return safeNext(next);
  } catch {
    return DEFAULT_NEXT;
  }
}
